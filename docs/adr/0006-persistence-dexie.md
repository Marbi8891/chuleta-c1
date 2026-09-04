# ADR-0006: Persistencia de progreso con Dexie/IndexedDB (Fase 3)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

Desde la Fase 2, el progreso del usuario (temas leídos, flashcards
dominadas, historial de tests, preferencia de tamaño de letra) vivía en
`localStorage["chuletaC1_v1"]`, migración funcional literal del `state`
de la app legacy de un solo fichero (ver `src/state/appState.ts`). La
Fase 3 sustituye esa persistencia por IndexedDB (vía Dexie), sin perder
el progreso ya guardado y sin tocar el contenido académico
(`src/data/*.json`), que sigue siendo estático, versionado en Git y
completamente ajeno a esta capa.

## Decisión: Dexie sobre IndexedDB, sin store React paralelo

Se usa [Dexie](https://dexie.org/) como envoltorio sobre IndexedDB (en vez
de la API nativa a pelo, o alternativas como `idb`) por su ergonomía
(`db.tabla.put/get/where`, transacciones con `async`/`await` normal) y su
integración oficial con React vía `dexie-react-hooks` (`useLiveQuery`).

**IndexedDB es la única fuente mutable de verdad.** Deliberadamente NO se
mantiene una copia paralela del progreso en un store de React global (ni
Context, ni Zustand — que además la especificación de Fase 3 prohíbe
introducir esta fase): los componentes que necesitan progreso reactivo
(`StudyHomePage`, `StatsStrip`) usan `useLiveQuery` directamente sobre
Dexie (ver `src/db/topicProgress.ts`, `useStudiedTopics()`); los que
necesitan una lectura puntual, asíncrona pero SIEMPRE fresca (nunca
cacheada) la hacen directamente contra Dexie en el momento en que la
necesitan (ver `getKnownFlashcardIds()` en `src/db/flashcardProgress.ts`
y el razonamiento detallado ahí). Esto evita exactamente la situación que
la especificación de Fase 3 pide evitar: "IndexedDB + localStorage +
React global state representando simultáneamente el mismo dato".

## Nombre de la base: `chuletaC1`

`DB_NAME` (`src/db/schema.ts`) es `'chuletaC1'` — el mismo prefijo que ya
usaba la clave de localStorage (`chuletaC1_v1`), por consistencia de
nomenclatura con el resto del proyecto. **No debe cambiar nunca**: cambiar
el nombre de una base IndexedDB equivale a crear una base distinta y
perder acceso a la existente (no hay "rename" en IndexedDB). Fijado como
constante única, importada donde haga falta, y cubierto por un test
(`src/db/db.test.ts`) para que un cambio accidental se detecte en CI.

## Tablas (schema v1)

`appMeta`, `topicProgress`, `flashcardProgress`, `quizSessions`,
`quizAnswers` — la propuesta de la especificación de Fase 3, aceptada tal
cual (ver `src/db/schema.ts` para las interfaces completas y el
razonamiento de cada campo). Nota sobre `quizAnswers`: las sesiones
migradas desde legacy (`quizHistory`) NO tienen filas de `quizAnswers`
asociadas — legacy nunca guardó qué se respondió pregunta a pregunta, así
que no hay nada que migrar ahí (ver `docs/LEGACY_MIGRATION.md`). Solo las
sesiones nuevas, jugadas desde esta fase en adelante, tienen su detalle
completo.

Índices deliberadamente mínimos: solo `quizAnswers.sessionId` (para poder
recuperar las respuestas de una sesión). `known`/`studied` son booleanos
— IndexedDB ni siquiera admite booleanos como clave de índice — así que se
leen tablas enteras (≤165 filas) y se filtra en memoria, en vez de forzar
un índice artificial (p. ej. `known` como 0/1) que no aporta nada con este
volumen de datos.

## Versionado del schema

`db.version(1).stores(...)` se declara explícitamente (nunca implícito),
aunque hoy solo exista v1. Regla para el futuro, documentada aquí y
cumplida por construcción (nunca `db.delete()`/`indexedDB.deleteDatabase()`
como forma de "actualizar" el schema): cualquier cambio de forma futuro
añade `db.version(2)`, `db.version(3)`, ... con `.upgrade()` cuando haga
falta transformar filas existentes.

## Lectura async + UI síncrona: por qué no hay caché intermedia

La Fase 2B corrigió un bug de cierre obsoleto en `FlashcardsPage`
(`buildQueue`, memoizada con `useCallback`, leía `known` a través de un
snapshot de render que podía quedar desfasado tras un
`resetKnownFor()` síncrono seguido de `restart()`). Con Dexie, las
lecturas son async por naturaleza, lo que podría reintroducir una clase de
bug parecida (o peor) si se intentara mantener una caché en memoria
sincronizada por reactividad (`useLiveQuery`) y leerla dentro de una
función memoizada — la actualización de una `liveQuery` tras una escritura
no está garantizada antes de la siguiente línea de código que se ejecuta.

La solución adoptada, deliberadamente simple: **nunca cachear, siempre
`await` una lectura fresca en el momento de usarla, y encadenar
`await escritura` → `await reconstrucción`** (ver `handleResetKnown` en
`FlashcardsPage.tsx` y el comentario de `getKnownFlashcardIds()`). Esto
hace que `buildQueue` sea async, lo cual es una complejidad real pero
pequeña y localizada, a cambio de una garantía de corrección por
construcción en vez de por temporización. Ver
`src/features/flashcards/Flashcards.test.tsx` (test de regresión,
adaptado a Dexie) y la verificación manual con Chromium contra el build de
producción real (IndexedDB real, no `fake-indexeddb`) documentada en el
checkpoint de esta fase.

## `src/state/appState.ts`: de store activo a documentación de solo lectura

El módulo se conserva, pero reducido a `STORAGE_KEY` + los tipos
(`AppState`, `QuizHistoryEntry`) — ya no expone `getState`/`subscribe` ni
mutadores. `src/db/legacyMigration.ts` lee la clave de localStorage de
forma independiente (no reexporta ningún estado mutable de aquí), porque
necesita distinguir "no hay nada que migrar" (clave ausente) de "hay algo
pero está corrupto" (JSON inválido) — algo que el `try/catch` silencioso
del store original no permitía. `src/state/useAppState.ts` (el hook
`useSyncExternalStore` sobre ese store) se ha eliminado: ya no tiene
ningún consumidor una vez que `StudyHomePage`/`StatsStrip` pasan a
`useStudiedTopics()` (Dexie).

## PersistenceGate

`src/db/PersistenceGate.tsx` envuelve la app (dentro de `<BrowserRouter>`,
antes de `ScopeProvider`/`QuizProvider`) y espera a `db.open()` +
`runLegacyMigration()` antes de montar el resto — así ningún componente
lee "0 temas leídos" un instante para luego sustituirlo por el progreso
real. Si `db.open()` falla, se muestra un mensaje simple y NO se monta el
resto de la app: toda la app depende de Dexie para leer/escribir
progreso, así que renderizarla igualmente solo produciría fallos
silenciosos en cada acción del usuario — más honesto bloquear con un
mensaje claro que fingir que funciona. Si la migración legacy falla (JSON
corrupto, transacción abortada) SÍ se deja pasar a `ready`: es un fallo
recuperable y no fatal (la app sigue siendo perfectamente usable sin
progreso legacy importado), y queda registrado en consola para poder
investigarlo.

## Fase 3B — PERSISTENCE HARDENING

Auditoría posterior a la Fase 3 que corrigió cinco puntos concretos, sin
tocar el diseño de arriba (tablas, `DB_NAME`, versionado, ausencia de store
paralelo — todo eso queda aprobado tal cual):

1. **Migración legacy bajo concurrencia**: la comprobación de
   `legacyMigrationVersion` se repite DENTRO de la transacción de
   migración (no solo antes de abrirla), aprovechando que IndexedDB
   serializa las transacciones `readwrite` que comparten object store —
   ver la sección "Idempotencia bajo concurrencia" de
   `docs/LEGACY_MIGRATION.md`. Los ids de las sesiones migradas pasaron de
   `crypto.randomUUID()` a deterministas (`legacy-{índice}`) como capa
   adicional de seguridad.
2. **`storage-unavailable` como estado propio**: `runLegacyMigration()`
   distinguía mal "localStorage no tiene la clave" de "localStorage lanzó
   al leer" — ambos colapsaban en "nada que migrar" y marcaban la
   migración como completada. Ahora son dos resultados distintos; el
   segundo NO marca completado y se reintenta en el próximo arranque. Ver
   `docs/LEGACY_MIGRATION.md`.
3. **Finalización de test segura (SAFE QUIZ COMPLETION)**: `QuizContext`
   ya no marca `completed: true` en el mismo tick que se pulsa "Siguiente"
   en la última pregunta — antes disparaba `void recordQuizSession(...)`
   sin esperar. Ahora `completed` solo pasa a `true` tras un
   `await recordQuizSession(...)` exitoso (estados `saving`/`saveError`
   añadidos a `QuizState`); si falla, la sesión (respuestas, score,
   `sessionId`) permanece intacta en memoria y la UI (`QuizRunPage`)
   muestra el error con un botón que reintenta el mismo guardado.
4. **`recordQuizSession` idempotente por `sessionId`**: al no completarse
   de forma síncrona, una sesión puede intentar guardarse más de una vez
   (reintento tras fallo). `quizSessions.put` ya era idempotente por PK,
   pero `quizAnswers` usaba un id autoincremental sin deduplicar — ahora,
   dentro de la misma transacción, se borran las respuestas previas de esa
   `sessionId` antes de reinsertar, así dos llamadas dejan siempre N filas
   (nunca 2N).
5. **Escrituras "fire-and-forget" auditadas**: `markTopicStudied()` y
   `setFlashcardKnown()` siguen sin bloquear la navegación a propósito
   (progreso de bajo riesgo, fácilmente reversible) — pero antes se
   llamaban como `void fn(...)` sin ningún `.catch`, así que un fallo real
   de Dexie quedaba como promesa rechazada sin gestionar. Ahora ambas
   llamadas capturan el error con un helper común
   (`src/db/reportWriteError.ts`) que deja un log con contexto.
   `handleResetKnown` (FlashcardsPage) sigue siendo la excepción que SÍ
   espera (`await`): reconstruir la cola de flashcards antes de que el
   borrado se confirme en Dexie mostraría datos visiblemente
   inconsistentes, no solo una escritura de bajo riesgo perdida — ver el
   comentario en `FlashcardsPage.tsx`.

## Consecuencias / deuda explícita para fases futuras

- SM-2/ease factor/intervals para flashcards: fuera de alcance a
  propósito (especificación de Fase 3, punto FLASHCARD PROGRESS) —
  `flashcardProgress` es intencionadamente solo `{flashcardId, known}`.
- Ninguna pantalla muestra todavía el historial de `quizSessions` (la app
  legacy tampoco mostraba `quizHistory` en ninguna parte de la UI — solo
  lo acumulaba). Persistirlo ya deja la base para una futura pantalla de
  "Historial", sin que esta fase tenga que construirla.
- Sesión de test EN CURSO (antes de completarla) sigue viviendo solo en
  `QuizContext` (React, memoria) — no se persiste a mitad de test. Es una
  decisión explícita de alcance de la especificación de Fase 3
  ("Prioridad: persistencia de progreso completado"), no una limitación
  técnica: si el usuario cierra la pestaña a mitad de un test, ese test no
  deja rastro — igual que en legacy.
