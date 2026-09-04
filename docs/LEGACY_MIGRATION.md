# LEGACY_MIGRATION — de localStorage a IndexedDB (Fase 3)

Este documento describe, campo a campo, cómo `src/db/legacyMigration.ts`
migra `localStorage["chuletaC1_v1"]` (app legacy y app React de la Fase 2,
ver `src/state/appState.ts`) a IndexedDB (Dexie, ver `src/db/schema.ts`).

La migración se ejecuta una única vez, automáticamente, al arrancar la app
(ver `src/db/PersistenceGate.tsx`), y nunca borra ni modifica la fuente
legacy — ver "Fuente legacy" más abajo.

## Forma real auditada de `chuletaC1_v1`

Antes de escribir la migración se auditó la forma exacta que escribía
`src/state/appState.ts` (Fase 2) — que a su vez migró funcionalmente el
`state`/`saveState()` de `legacy/index.original.html`:

```ts
interface AppState {
  known: Record<string, boolean>; // flashcardId -> dominada
  studied: Record<string, boolean>; // topicId -> leído
  quizHistory: QuizHistoryEntry[]; // { date: string; total: number; pct: number }[], recortado a 20 entradas
  studyFsIndex?: number; // índice de tamaño de letra de Estudiar (0..4), GLOBAL
}
```

No hay más campos que estos cuatro. No se ha inventado ningún campo
adicional para la migración.

## Tabla de mapeo

| Campo legacy | Destino nuevo | Regla |
|---|---|---|
| `known[flashcardId]` | `flashcardProgress` | Solo se migran las entradas con valor `true`. En legacy, `false` y "ausente" son indistinguibles (se lee por verdad); el modelo nuevo tampoco distingue "known=false" de "sin fila" — así que una entrada `false` no genera fila. Si `flashcardId` no corresponde a ninguna flashcard del contenido actual, se omite (huérfana) y se cuenta en `summary.flashcardsSkippedOrphan` — nunca se crea una fila para un id que no existe. |
| `studied[topicId]` | `topicProgress` | Misma regla que `known`: solo `true`, huérfanos (topicId inexistente) se omiten y se cuentan en `summary.topicsSkippedOrphan`. |
| `studyFsIndex` | `appMeta` (clave `studyFsIndex`) | **Deliberadamente NO va a `topicProgress`**, aunque un ejemplo conceptual inicial de la especificación de Fase 3 lo sugería como `topicProgress.studyStep`. Auditado el comportamiento real: `studyFsIndex` es una preferencia **global** de lectura (una única variable en legacy, usada por `applyStudyFs()`/`updateStudyFsUI()`), no algo por tema — nunca existió un tamaño de letra distinto por tema. Migrarlo a `topicProgress` habría exigido duplicarlo en 25 filas o elegir arbitrariamente una, ninguna de las cuales sería fiel al comportamiento legacy. Se recorta al rango válido (0..4, ver `STUDY_FS_STEPS` en `src/db/topicProgress.ts`) por si el valor guardado quedó corrupto o fuera de rango. |
| `quizHistory[i]` (`{date, total, pct}`) | `quizSessions` (una fila por entrada, `migratedFromLegacy: true`) | `startedAt` y `completedAt` se fijan al mismo valor (`date`) — legacy no distinguía inicio de fin. `totalQuestions = total`. `legacyPct = pct` se conserva tal cual. **`correctAnswers`/`incorrectAnswers` se dejan `undefined`, a propósito**: `pct` está redondeado (`Math.round((score/total)*100)`), así que reconstruir un recuento exacto de aciertos invirtiendo esa fórmula podría no coincidir con el valor real histórico — sería inventar precisión que el dato original no tiene. `blankAnswers: 0` (ver más abajo). `scope` queda `undefined`: legacy no registraba de qué alcance procedía cada test. Ninguna entrada de `quizAnswers` se crea para estas filas: legacy nunca guardó qué se respondió pregunta a pregunta, así que no hay nada que migrar ahí — inventarlo violaría la regla de no fabricar historial. Una entrada con forma inesperada (campos que faltan o no son del tipo correcto) se omite individualmente y se cuenta en `summary.quizHistoryEntriesSkipped`, sin abortar el resto de la migración. |
| — (no existía en legacy) | `QuizSessionRecord.blankAnswers = 0` | No es una migración de un campo real: se fija a 0 porque tanto la app legacy como la app React (Fases 2-3) exigen responder cada pregunta para poder avanzar — no existe ni existió un camino para dejar una pregunta en blanco. Es una inferencia mecánica sobre el comportamiento conocido de la UI, no una suposición sobre datos. |

## Casos frontera

- **No hay clave `chuletaC1_v1` en localStorage** (usuario nuevo, o ya
  migrado y el navegador purgó localStorage): se marca la migración como
  completada sin crear ninguna fila. No es un error.
- **JSON mal formado**: la migración se aborta por completo, no se toca
  IndexedDB, no se marca como completada, se registra un `console.error`.
  Se reintentará en el siguiente arranque.
- **Forma de alto nivel inesperada** (por ejemplo, un array en la raíz, o
  `studied` no es un objeto): igual que JSON mal formado — abortar,
  no tocar nada, no marcar, loggear, reintentar en el próximo arranque.
- **Una entrada suelta con forma rara dentro de un contenedor por lo demás
  válido** (una entrada de `quizHistory` sin `total` numérico): se omite
  esa entrada concreta y se cuenta, pero el resto de la migración continúa
  con normalidad — no se penaliza todo el progreso del usuario por un
  campo puntual corrupto.
- **Referencia a contenido que ya no existe** (`studied["X-T99"]` para un
  tema eliminado, `known["cXXX"]` para una flashcard eliminada): se omite
  y se cuenta (`topicsSkippedOrphan`/`flashcardsSkippedOrphan`), nunca se
  crea una fila con una referencia rota — ver "QUESTION REFERENCES" en la
  especificación de Fase 3: IndexedDB solo referencia contenido real por
  id, nunca lo duplica ni admite ids inventados.
- **La transacción Dexie falla a mitad** (cuota agotada, error interno):
  Dexie revierte automáticamente TODA la transacción — nada queda a medio
  migrar, `legacyMigrationVersion` tampoco se marca, así que el siguiente
  arranque reintenta desde cero. Ver `src/db/legacyMigration.test.ts`,
  bloque "MIGRATION TRANSACTION", que fuerza este caso y comprueba que no
  queda ninguna fila huérfana en ninguna tabla.
- **`localStorage` inaccesible** (lanza al leer — modo privado estricto,
  cuota, etc.): se trata igual que "no hay clave" (nada que migrar, se
  marca como completada) en vez de bloquear la app reintentando contra un
  storage que nunca va a responder.

## Idempotencia

`runLegacyMigration()` comprueba `appMeta.legacyMigrationVersion` como
primer paso. Si ya es `>= LEGACY_MIGRATION_VERSION`, devuelve
`{status: 'already-migrated'}` inmediatamente, sin leer localStorage ni
tocar ninguna tabla — así que llamarla en cada arranque de la app (lo que
hace `PersistenceGate`) es seguro y barato después de la primera vez. Ver
el bloque "IDEMPOTENCIA" en `src/db/legacyMigration.test.ts`: ejecutarla
dos veces seguidas produce exactamente las mismas filas la segunda vez.

## Fuente legacy: nunca se borra

`src/db/legacyMigration.ts` solo LEE `localStorage["chuletaC1_v1"]`
(mediante `localStorage.getItem`, nunca `removeItem` ni `clear`). La app
ya no vuelve a ESCRIBIR en esa clave desde la Fase 3 (ver el comentario de
cabecera de `src/state/appState.ts`) — a todos los efectos queda congelada
tal y como estaba en el momento de migrar, como copia de seguridad
temporal. Decidir cuándo (y si) limpiarla queda para una fase posterior,
explícitamente fuera de alcance de la Fase 3.
