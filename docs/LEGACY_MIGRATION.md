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
- **`localStorage` inaccesible** (`getItem` lanza — modo privado estricto,
  cuota, entorno sin storage, etc.): **Fase 3B — corregido.** Antes se
  trataba igual que "no hay clave" (se marcaba la migración como
  completada). Eso era incorrecto: "el storage no responde ahora mismo" no
  es lo mismo que "este usuario no tiene progreso legacy". Desde la Fase
  3B, `runLegacyMigration()` distingue ambos casos explícitamente
  (`readRawLegacyBlob()` devuelve `{available: false}` en vez de `null`) y
  devuelve `{status: 'storage-unavailable'}`: NO se marca
  `legacyMigrationVersion`, así que se reintenta en el próximo arranque.
  IndexedDB no se ve afectada y la app sigue siendo usable
  (`PersistenceGate` lo trata como no fatal, igual que
  `invalid-legacy-data`/`migration-failed`). Solo "la clave realmente no
  existe" (`getItem` devuelve `null` sin lanzar) sigue marcándose como
  completada — ver `src/db/legacyMigration.test.ts`, bloque "STORAGE
  UNAVAILABLE".

## Idempotencia

`runLegacyMigration()` comprueba `appMeta.legacyMigrationVersion` como
primer paso. Si ya es `>= LEGACY_MIGRATION_VERSION`, devuelve
`{status: 'already-migrated'}` inmediatamente, sin leer localStorage ni
tocar ninguna tabla — así que llamarla en cada arranque de la app (lo que
hace `PersistenceGate`) es seguro y barato después de la primera vez. Ver
el bloque "IDEMPOTENCIA" en `src/db/legacyMigration.test.ts`: ejecutarla
dos veces seguidas produce exactamente las mismas filas la segunda vez.

### Idempotencia bajo concurrencia (Fase 3B)

La comprobación de arriba, por sí sola, **no** es suficiente si dos
llamadas a `runLegacyMigration()` se solapan (dos pestañas, o dos montajes
concurrentes de `PersistenceGate` en React StrictMode): ambas podrían leer
"no migrado" antes de que ninguna haya escrito nada, y las dos ejecutarían
la migración completa — especialmente grave para `quizHistory`, que hasta
la Fase 3B generaba un `crypto.randomUUID()` por sesión migrada, así que
dos ejecuciones habrían creado el DOBLE de filas en `quizSessions`, cada
una con un id distinto (ninguna de las dos se habría detectado como
duplicado).

La corrección (Fase 3B, punto 1) vuelve a leer `appMeta.legacyMigrationVersion`
**dentro** de la propia transacción `readwrite` que hace la migración. Esto
funciona porque IndexedDB serializa las transacciones `readwrite` que
comparten al menos un object store: si dos llamadas abren esa transacción
casi a la vez, la segunda queda en cola hasta que la primera confirma
(commit) — y cuando por fin entra, la re-lectura ve ya escrito el trabajo
de la primera y hace no-op (`{status: 'already-migrated'}`) en vez de
volver a migrar. Como capa adicional, los `id` de las sesiones migradas
dejaron de ser `crypto.randomUUID()` y pasaron a ser deterministas
(`legacy-{índice}`, ver más abajo) — así, si esta función se llamara alguna
vez fuera de su guarda normal, `quizSessions.put` reemplazaría la fila en
vez de duplicarla. Ver el bloque "CONCURRENCIA" en
`src/db/legacyMigration.test.ts`, que fuerza el escenario exacto con
`Promise.all([runLegacyMigration(db), runLegacyMigration(db)])` sobre un
legacy con 1 tema, 1 flashcard y 2 entradas de `quizHistory`, y comprueba
que el resultado final es 1/1/2 filas — nunca el doble.

### IDs deterministas para sesiones migradas

Las filas de `quizSessions` creadas por la migración usan `legacy-{índice}`
(la posición de la entrada dentro del array `quizHistory` de esa
ejecución) en vez de un UUID aleatorio. El array de `quizHistory` no se
reordena en ningún punto de este módulo, así que el índice es estable
dentro de una misma migración. Las sesiones NUEVAS (creadas desde la app,
no migradas) siguen usando `crypto.randomUUID()` — ver `QuizContext.tsx` —
así que no hay riesgo de colisión entre ambos espacios de nombres.

### Política de conflicto en migración diferida (Fase 3C)

Los dos apartados anteriores cubren dos migraciones que se disputan el
mismo dato legacy al mismo tiempo. Existe un tercer escenario, distinto:
una **migración diferida** que se reintenta después de que el usuario ya
haya generado progreso nuevo directamente en IndexedDB.

Ejemplo real: en el primer arranque, `localStorage` no está disponible
(ver "STORAGE UNAVAILABLE" arriba) — la migración se aplaza,
`legacyMigrationVersion` NO se marca. El usuario sigue usando la app con
total normalidad: estudia temas, repasa flashcards, hace tests — todo se
guarda directamente en IndexedDB (Dexie), sin pasar por la migración. Más
tarde, en un arranque posterior, `localStorage` vuelve a estar disponible
y `runLegacyMigration()` se ejecuta de verdad, encontrando el
`chuletaC1_v1` legacy original (que no sabe nada del progreso nuevo hecho
mientras tanto).

**Política: EXISTING INDEXEDDB DATA WINS.** Si ya existe una fila/valor en
IndexedDB para un dato que la migración también querría escribir, la
migración NO la toca — se salta ese campo y sigue con el resto. Legacy
solo rellena huecos genuinamente vacíos, nunca sobrescribe algo que el
usuario ya generó con la app nueva. Aplica a tres sitios, todos dentro de
la misma transacción de migración:

| Campo | Comprobación | Contador si ya existía |
|---|---|---|
| `topicProgress[topicId]` | `database.topicProgress.get(topicId)` | `summary.topicsSkippedExisting` |
| `flashcardProgress[flashcardId]` | `database.flashcardProgress.get(flashcardId)` | `summary.flashcardsSkippedExisting` |
| `appMeta.studyFsIndex` | `database.appMeta.get('studyFsIndex')` | `summary.studyFsIndexSkippedExisting = true` |

El caso crítico es `flashcardProgress`: si el usuario ya marcó una
flashcard como "no dominada" (`known: false`) con la app nueva, y legacy
tiene esa misma flashcard como `known: true` (estado antiguo, anterior a
que el usuario decidiera repasarla de nuevo), la migración NUNCA debe
revertir ese `false` a `true` — sería deshacer silenciosamente una
decisión que el usuario tomó después. Lo mismo aplica a `topicProgress` y
a `studyFsIndex` (si el usuario ya cambió el tamaño de letra con la app
nueva, legacy no lo pisa). `databaseCreatedAt` en `appMeta` seguía sin
sobrescribirse si ya existía desde antes de la Fase 3C — este
comportamiento no cambia.

Las entradas de `quizHistory` migradas (`quizSessions` con id
`legacy-{índice}`) no entran en este conflicto: como ya usan un espacio de
ids determinista y disjunto de los UUID de sesiones nuevas (ver arriba),
"migrar de más" nunca puede pisar una sesión nueva — como mucho
reescribiría su propia fila `legacy-N` con el mismo contenido (`put` es
idempotente por diseño desde la Fase 3B).

Ver el bloque "DEFERRED MIGRATION CONFLICT" en
`src/db/legacyMigration.test.ts`: reproduce el escenario completo de dos
arranques (storage inaccesible → progreso nuevo en Dexie → storage
disponible con datos legacy en conflicto → segunda ejecución de la
migración) y comprueba que el dato de IndexedDB generado en el primer
arranque sobrevive intacto, mientras que los huecos que legacy sí puede
rellenar (un tema o flashcard sin fila previa) se migran con normalidad.

## Fuente legacy: nunca se borra

`src/db/legacyMigration.ts` solo LEE `localStorage["chuletaC1_v1"]`
(mediante `localStorage.getItem`, nunca `removeItem` ni `clear`). La app
ya no vuelve a ESCRIBIR en esa clave desde la Fase 3 (ver el comentario de
cabecera de `src/state/appState.ts`) — a todos los efectos queda congelada
tal y como estaba en el momento de migrar, como copia de seguridad
temporal. Decidir cuándo (y si) limpiarla queda para una fase posterior,
explícitamente fuera de alcance de la Fase 3.
