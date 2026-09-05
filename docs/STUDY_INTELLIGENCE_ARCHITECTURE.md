# Study Intelligence Architecture — Chuleta C1

- **Estado:** En progreso (documento vivo — se actualiza en cada fase)
- **Fecha de creación:** 2026-09-05
- **Rama base:** `feat/capacitor-android-foundation` (cerrada y validada) → `feat/study-intelligence`
- **Ámbito:** transformar Chuleta C1 de lector de temario + motor de tests en una plataforma de inteligencia de estudio (STUDY → PRACTICE → ERROR DETECTION → REVIEW → SPACED REPETITION → MOCK EXAM → WEAKNESS ANALYSIS → PLANNING → RETESTING → MASTERY), preservando el contenido académico, los datos del usuario, Android y el funcionamiento offline.

Este documento es el punto de referencia de toda la iniciativa. Cada fase (Fase 1, 2, 3...) añade su sección de diseño concreto aquí ANTES de implementarse, y su resultado real (ficheros, tests, riesgos) en el informe de cierre de fase (no en este documento — ver commits y PRs).

---

## 1. Auditoría del repositorio existente (Fase 0)

### 1.1 Estado verificado en el momento de escribir esto

```
git branch --show-current   → feat/capacitor-android-foundation
git status --short          → (vacío — working tree limpio)
git log --oneline -15       → ver tabla abajo
node --version              → v22.23.2 (sandbox de validación; Node real del
                               Mac es v24.18.1 vía nvm/.nvmrc — ver docs/adr/0003)
npm --version                → 10.9.8
npm run check                → PASS completo:
  verify-content              → OVERALL: PASS (25 temas / 25 bancos / 500
                                 preguntas / 165 flashcards / CONTENT
                                 EQUIVALENCE: PASS)
  typecheck (tsc)              → PASS, 0 errores
  lint (eslint .)               → PASS, 0 errores, 3 warnings preexistentes
                                 (react-refresh/only-export-components en
                                 QuizContext.tsx y ScopeContext.tsx — no
                                 relacionados con esta iniciativa)
  test (node --test + vitest)  → Node: 29/29 · Vitest: 76/76 (14 ficheros)
  build (vite build)            → PASS, 25 entradas de precache PWA
                                  (1086.06 KiB), chunk principal 862.78 kB
```

Últimos 15 commits (`feat/capacitor-android-foundation`):

```
c6038b6 feat(android): add Capacitor Android platform
bcbca0e build(android): add Capacitor-specific Vite build
7e4cdd5 style(ui): align menu with app title
cac3539 fix(ui): place menu beside app name
1061ad6 test(ui): cover lateral menu interactions
66c2ae4 feat(ui): load lateral menu styles
123ac72 feat(ui): style lateral navigation drawer
099c476 feat(ui): wire lateral menu into app header
e432fb0 feat(ui): add lateral navigation drawer
9de8de3 test(ui): cover distinct tab content
d7e2c5a fix(ui): collapse shared scope by default
a404c14 fix(ui): show scope only where relevant
eda0e3f chore(lint): ignore generated Android project
48a0b51 feat(more): add quiz history and result detail
8956afe build(android): add Capacitor-specific Vite build
```

Baseline de contenido académico (`CONTENT_INTEGRITY.json`):

```
legacySource.sha256 = d8d0c7758dc48a5b19c0d9c533c2937a7323fadb45edde0918234123917d8775
academicStatus      = EXPERT_AUDITED
baseline / nonRegressionFloor = { studyTopics: 25, quizBanks: 25, questions: 500, flashcards: 165 }
```

Este SHA y estos cuatro números son el contrato que ninguna fase de esta iniciativa puede romper. Todo lo que sigue se diseña alrededor de ellos, nunca al revés.

### 1.2 Arquitectura actual (lo que ya existe y hay que preservar)

**Stack:** React 18 + TypeScript estricto + Vite 5 + React Router 6 (rutas anidadas bajo `<AppLayout>`) + Dexie 4 sobre IndexedDB + `vite-plugin-pwa` (Workbox, `generateSW`) + Capacitor 8 (Android únicamente, `es.mrabeh.chuletac1`).

**Capas, de abajo arriba:**

1. **Contenido académico (`src/data/`, `src/types/`)** — tres JSON estáticos (`study_bank.json`, `quiz_bank.json`, `flashcards.json`) importados como módulos ES (inline en el bundle, cero fetch en runtime — ADR-0001). `src/data/index.ts` es el ÚNICO punto de acceso permitido: expone `getTopics/getTopicById/getQuizBanks/getQuestions/getQuestionById/getFlashcards/...` sobre `Map`s construidos una vez al cargar el módulo. Cada pregunta tiene un `QuestionId` global estable (`<topicId>-Q<NNN>`, `src/data/ids.ts` + `ids.impl.mjs`) que es la clave que toda la inteligencia de estudio debe usar para referenciar preguntas — nunca el índice de un array.
2. **Pipeline de integridad (`scripts/`, `tests/*.test.mjs`, `CONTENT_INTEGRITY.json`)** — SHA gate sobre `legacy/index.original.html`, extracción con promoción transaccional y rollback, `verify-content.mjs` como puerta de solo lectura con SHA gate + equivalencia campo a campo + validación estructural + baseline + non-regression floor. 29 tests de Node cubren esto. **Ninguna fase de Study Intelligence toca `scripts/`, `legacy/`, `CONTENT_INTEGRITY.json` ni `src/data/*.json`.**
3. **Persistencia de progreso (`src/db/`)** — instancia Dexie única (`db.ts`), `db.version(1)` con cinco tablas: `appMeta` (key/value interno), `topicProgress` (PK `topicId`, `{studied, updatedAt}`), `flashcardProgress` (PK `flashcardId`, `{known, updatedAt}`), `quizSessions` (PK `id`) y `quizAnswers` (`++id, sessionId`). Todas las fechas son ISO 8601 string. Deliberadamente sin índices salvo lo que de verdad se consulta (`sessionId`). `legacyMigration.ts` migra una única vez desde `localStorage["chuletaC1_v1"]`, con política **EXISTING WINS** (si ya hay una fila en Dexie, la migración legacy nunca la sobrescribe) y resultado tipado explícito (`already-migrated | no-legacy-data | invalid-legacy-data | migrated | migration-failed | storage-unavailable`) — nunca un booleano de "¿fue bien?". `PersistenceGate.tsx` bloquea el montaje de la app hasta que `db.open()` + migración terminan, con un estado de error explícito (no un "modo degradado" silencioso).
4. **Dominio de sesión de test (`src/app/QuizContext.tsx`)** — reducer + Context, no Redux. Guarda cada respuesta con su `QuestionId` real. **SAFE QUIZ COMPLETION**: `completed` solo pasa a `true` tras un `await recordQuizSession(...)` exitoso; un fallo dispara `SAVE_ERROR` sin tocar el resto del estado, permitiendo reintentar sin perder el test. `recordQuizSession` (`src/db/quiz.ts`) es **idempotente por `sessionId`** dentro de una única transacción Dexie (`quizSessions.put` + `quizAnswers` borra-e-inserta) — precedente directo para `StudyEvent`/`ErrorRecord`/`mockExamSessions` en fases futuras.
5. **UI / routing (`src/app/`, `src/features/`)** — `AppRouter` con `React.lazy` por ruta (`/`, `/study`, `/study/:topicId`, `/quiz`, `/quiz/run`, `/quiz/results`, `/flashcards`, `/more`, `/more/tests/:sessionId`). `ScopeContext` (alcance de temas para Test/Repaso, NO persistido — se reinicia a "todos" en cada carga, igual que legacy). `AppLayout` monta cabecera + `SideMenu` (drawer simple: Hoy/Temario/Test/Repaso/Historial) + `StatsStrip` + `ScopePanel` (solo visible en Test/Repaso) + `Outlet` + `BottomNav` (5 destinos fijos: Hoy/Temario/Test/Repaso/Más). `MorePage`/`QuizHistoryDetailPage` (`src/features/more/`) ya implementan un historial de tests con "Repetir fallos" — es el precedente más cercano a Cuaderno de Errores / Test de errores que se construirá en la Fase 2-3.
6. **PWA / Capacitor (`src/pwa/`, `vite.config.ts`, `capacitor.config.ts`, `android/`)** — `VitePWA({ disable: mode === 'capacitor', ... })`: el Service Worker YA está correctamente desactivado en el build de Capacitor (`npm run build:android` → `vite build --mode capacitor`) — **confirmado en el código, no supuesto**; en el build web normal permanece activo con `registerType: 'prompt'` (nunca auto-reload) y precache total del app shell + contenido académico embebido. `android/` es un proyecto Capacitor estándar (Gradle 8.14.3, Java 21, `appId: es.mrabeh.chuletac1`); su `.gitignore` (heredado de la plantilla oficial de Android) ya excluye `local.properties`, `*.apk`/`*.aab`, `.gradle/`, `build/`, `*.jks`/`*.keystore` — verificado con `git ls-files`: ninguno de esos artefactos está trackeado hoy.
7. **CI (`​.github/workflows/`)** — `ci.yml` corre `npm ci && npm run check` en cada PR y en pushes a `feat/**`; `deploy-pages.yml` despliega a GitHub Pages solo desde `main`. **Ninguno de los dos ejecuta el build de Android** (`build:android` + `gradlew assembleDebug`) — es una validación manual local hoy. No se cambia en Fase 1-3; se señala como riesgo/mejora futura en la sección 7.

**Puntos fuertes a preservar explícitamente** (no reinventar): el patrón de resultado discriminado en vez de booleanos, la escritura idempotente por id estable, las transacciones Dexie "todo o nada", la política EXISTING WINS ante conflictos de migración, el `QuestionId` global como clave universal, y el estilo de comentarios que documenta el PORQUÉ (referencian legacy, ADRs y número de fase) — todo el código nuevo de Study Intelligence debe seguir el mismo estilo.

### 1.3 Arquitectura propuesta (visión, no todo se construye ya)

```
┌─────────────────────────────────────────────────────────────────┐
│ CONTENIDO ACADÉMICO (intocable)                                  │
│ src/data/*.json  ·  legacy/  ·  scripts/  ·  CONTENT_INTEGRITY   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ referenciado por QuestionId/TemaId
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ CAPA DE EVENTOS (Fase 1 — NUEVA)                                 │
│ studyEvents (append-only) — QUESTION_ANSWERED, TOPIC_OPENED, ... │
└───────┬─────────────┬─────────────┬─────────────┬───────────────┘
        │              │             │             │
        ▼              ▼             ▼             ▼
┌───────────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐
│ ERROR NOTEBOOK│ │ SPACED    │ │ MASTERY   │ │ STUDY TIME /       │
│ (Fase 2)      │ │ REPETITION│ │ ENGINE    │ │ STREAKS (Fase 10-11)│
│ errorRecords  │ │ (Fase 7)  │ │ (Fase 12) │ │                     │
└───────┬───────┘ └─────┬─────┘ └─────┬─────┘ └──────────┬──────────┘
        │               │             │                   │
        ▼               ▼             ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ SERVICIOS DE DOMINIO (puros, testables, fuera de React)          │
│ errorNotebookService · spacedRepetitionEngine · masteryEngine    │
│ weaknessEngine · mockExamScoringEngine · studyPlannerEngine ...  │
└───────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ UI (React, mobile-first, progressive disclosure)                 │
│ Hoy · Practicar (Test/Simulacros) · Progreso · Planificar · ...  │
└─────────────────────────────────────────────────────────────────┘
```

Principios que gobiernan TODO el diseño de aquí en adelante:

- **Nunca duplicar el contenido canónico.** Un `errorRecord`/`bookmark`/`generatedQuestion` referencia una pregunta por `QuestionId`; nunca copia su enunciado/opciones/respuesta salvo que una fase de versionado (Fase 22) lo requiera explícitamente para snapshots históricos.
- **Append-only donde el dominio lo permita.** `studyEvents` nunca se edita ni se borra desde la UI — es el registro de lo que realmente pasó. Todo lo derivado (mastery, rachas, tiempo de estudio) se calcula a partir de eventos, nunca al revés.
- **Cada tabla nueva es una migración Dexie explícita y versionada**, nunca un cambio silencioso de forma de datos dentro de una tabla existente.
- **Todo dominio no trivial es un servicio puro** (`src/domain/<nombre>/*.ts`, sin importar React) con sus propios tests unitarios — igual que ya hace `buildQuizPool.ts`.
- **La IA nunca es la fuente de la verdad.** Todo lo que hoy puede calcularse determinísticamente (dominio, debilidades, recomendaciones, riesgo de olvido) se calcula así — la IA (Fase 29+) es una capa opcional, claramente etiquetada, sobre un cimiento 100% determinista.

---

## 2. Diseño de base de datos

### 2.1 Estrategia de versionado Dexie

Regla fija para toda la iniciativa (ya establecida en `docs/adr/0006-persistence-dexie.md`, se reafirma aquí): cada cambio de schema es un `db.version(N)` NUEVO y consecutivo, con `.upgrade()` cuando haga falta transformar filas existentes. Nunca `db.delete()`. Nunca se renombra `DB_NAME`. Añadir una tabla nueva NO requiere `.upgrade()` (Dexie crea el object store vacío al declarar la nueva versión); solo hace falta `.upgrade()` cuando se transforma contenido de una tabla YA existente.

Plan de versiones para las fases P0 (esta iniciativa empieza en v2; v1 es el schema actual, intocable):

| Versión | Fase | Tablas nuevas | `.upgrade()` necesario |
|---|---|---|---|
| 2 | Fase 1 | `studyEvents` | No (tabla nueva, vacía) |
| 3 | Fase 2 | `errorRecords` | No |
| 4 | Fase 4 | `questionBookmarks` | No |
| 5 | Fase 5 | `notes` | No |
| 6 | Fase 7 | `flashcardSchedule` | Sí, opcional: sembrar una fila `state: 'NEW'` por flashcard ya marcada `known` en `flashcardProgress`, para que la migración a SM-2 no le "resetee" el progreso a un usuario que ya se sabía la tarjeta. Se decide en el diseño detallado de la Fase 7, no aquí. |
| 7+ | Fase 9, 17-20, 22-24 | `studyGoals`, `mockExamSessions`, `mockExamAnswers`, `studyPlans`, `studyPlanItems`, `contentSources`, `contentRevisions`, `generatedQuestions`, `settings` | Se documentan al llegar a cada fase |

No se crean tablas por adelantado "por si acaso" — cada `db.version()` se añade en el commit de la fase que la necesita, con sus propios tests de migración (ver sección 6).

### 2.2 `StudyEvent` (Fase 1 — diseño detallado)

```ts
export type StudyEventType =
  | 'TOPIC_OPENED' | 'TOPIC_COMPLETED'
  | 'QUESTION_ANSWERED' | 'QUESTION_CORRECT' | 'QUESTION_INCORRECT'
  | 'FLASHCARD_REVIEWED' | 'FLASHCARD_KNOWN' | 'FLASHCARD_FAILED'
  | 'QUIZ_STARTED' | 'QUIZ_COMPLETED'
  | 'MOCK_EXAM_STARTED' | 'MOCK_EXAM_COMPLETED'
  | 'NOTE_CREATED' | 'QUESTION_STARRED' | 'ERROR_REVIEWED'
  | 'STUDY_SESSION_STARTED' | 'STUDY_SESSION_ENDED';

export interface StudyEventRecord {
  id?: number;              // autoincremental Dexie — no hay id natural estable para un evento
  type: StudyEventType;
  timestamp: string;         // ISO 8601 UTC, igual que el resto del proyecto
  topicId?: TemaId;
  questionId?: QuestionId;
  flashcardId?: string;
  quizSessionId?: string;
  mockExamId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>; // libre pero tipado por evento en helpers, nunca `any` disperso
}
```

Decisiones de diseño:

- **No duplicar `QUESTION_ANSWERED` con `quizAnswers`.** `quizAnswers` sigue siendo la fuente de verdad de "qué contestó el usuario en qué test" (con `sessionId`, necesaria para el detalle de historial). `StudyEvent` con `type: 'QUESTION_ANSWERED'` (+ `QUESTION_CORRECT`/`QUESTION_INCORRECT`) es un registro de ACTIVIDAD (para series temporales, streaks, tiempo de estudio, mastery) — se emite en el mismo momento en que `recordQuizSession` persiste, dentro de la misma función, pero es una tabla distinta con un propósito distinto (consulta por fecha/tipo, no por sesión). No se lee `quizAnswers` para reconstruir eventos ni viceversa.
- **Índices** (`db.version(2)`): `++id, type, timestamp, topicId, questionId, quizSessionId` — solo lo que Fase 1-14 realmente necesitan consultar (por tipo, por rango de fecha, por tema, por pregunta, por sesión). No se indexa `metadata` (objeto libre, IndexedDB no lo soporta como índice útil de todas formas).
- **Volumen**: un usuario activo puede generar cientos de eventos por sesión de estudio. Se acepta (es un dataset personal de un único usuario, no multi-tenant) pero se diseña `recordStudyEvent`/`queryStudyEvents` para leer por rango de índice, nunca `toArray()` completo salvo en tests o exportación de backup.
- **Emisión no invasiva**: los emisores de eventos se añaden en los puntos donde YA existe una escritura de progreso (`markTopicStudied`, `recordQuizSession`, `setFlashcardKnown`) — nunca se reescribe la lógica existente, solo se añade `await recordStudyEvent(...)` junto a la escritura ya validada. Si `recordStudyEvent` fallara, no debe romper la operación principal (se seguirá el mismo patrón try/catch-y-loggear que ya usa `PersistenceGate` para la migración legacy no fatal) — a decidir con precisión en la implementación, con test explícito de "fallo de evento no rompe guardado de progreso".

### 2.3 Entidades de fases posteriores (resumen, se detallan al llegar a cada fase)

`ErrorRecord` (Fase 2), `QuestionBookmark` (Fase 4), `Note` (Fase 5), `FlashcardSchedule` (Fase 7), `StudyGoal` (Fase 9), `MockExamSession`/`MockExamAnswer` (Fase 17-18), `StudyPlan`/`StudyPlanItem` (Fase 19), `ContentSource`/`ContentRevision` (Fase 22), `GeneratedQuestion` (Fase 31), `Settings` (Fase 25) — todas referencian contenido canónico por id estable, nunca lo copian, y siguen el mismo patrón de servicio + tabla + tests de migración que `StudyEvent`.

---

## 3. Estrategia de migración y compatibilidad

1. **Nunca destructiva.** Cada `db.version(N)` nueva es aditiva (tabla nueva) salvo que el diseño detallado de una fase justifique un `.upgrade()` explícito (documentado, con test que demuestra que las filas existentes sobreviven byte a byte donde no cambian, y se transforman correctamente donde sí).
2. **Existing-data-wins**, igual que `legacyMigration.ts`: cuando dos fuentes podrían escribir el mismo registro (p. ej. sembrar `flashcardSchedule` desde `flashcardProgress` en la Fase 7), el dato ya presente en la tabla nueva nunca se sobrescribe con un valor derivado.
3. **Tests de migración obligatorios por versión**: abrir una base con la versión anterior poblada con datos de fixture, subir a la versión nueva, verificar que las tablas antiguas son idénticas y que la tabla nueva tiene el estado esperado. Sigue el patrón ya usado en `db.test.ts`/`legacyMigration.test.ts` (Dexie + `fake-indexeddb`, dataset de fixture, nunca el dataset real).
4. **Sin cambios de rutas que rompan enlaces existentes.** Las nuevas rutas (`/errors`, `/bookmarks`, `/review`, etc.) son adiciones; ninguna ruta existente (`/study/:topicId`, `/quiz/run`, `/more/tests/:sessionId`...) se renombra sin un `<Navigate replace>` de redirección permanente.
5. **`android/` no se toca en Fase 1-3.** Ninguna de las tres primeras fases modifica `capacitor.config.ts`, `android/`, ni el `appId`. Se valida (`build:android` + `gradlew assembleDebug`) solo cuando una fase cambie comportamiento observable en la build nativa (Fase 1-3 no lo hace: son tablas Dexie + UI nueva bajo rutas nuevas, sin tocar PWA/Capacitor).

---

## 4. Dependencias entre features (por qué este orden)

```
Fase 1 (Study Events)
    │  (toda pregunta fallada se detecta viendo QUESTION_INCORRECT)
    ▼
Fase 2 (Error Notebook) ──────┐
    │                          │ (un test puede construirse "desde errores")
    ▼                          ▼
Fase 3 (Error-based quizzes) ← reutiliza QuizContext/buildQuizPool existentes
    │
    ▼
Fase 4 (Bookmarks) — independiente de 1-3 en datos, pero reutiliza el mismo
    │                 patrón de tabla+servicio y la misma UI de "crear test desde X"
    ▼
Fase 5 (Notes) — independiente en datos; se beneficia de existir ya un patrón
    │             de tabla ligada a topicId/questionId (Error Notebook, Bookmarks)
    ▼
Fase 6 (Global search) — indexa topics/preguntas/flashcards (ya existen) + notas
    │                     (Fase 5) → depende de que Notes exista para buscarlas
    ▼
Fase 7 (Spaced repetition) — sustituye flashcardProgress binario; depende de
    │                         Fase 1 para poder registrar FLASHCARD_REVIEWED
    ▼
Fase 8 (Hoy) — agrega TODO lo anterior (errores pendientes, repasos, streak,
               objetivo diario) → depende de 1, 2, 7 y, para objetivos, de la
               Fase 9 (aunque Fase 8 puede lanzarse con metas por defecto y
               Fase 9 solo añadir la UI de configurarlas)
```

P0 (Fases 1-8) es exactamente esto: la base de eventos, el cuaderno de errores, los tests de errores, favoritos, notas, búsqueda, repetición espaciada y el nuevo "Hoy" — en ese orden porque cada uno consume al anterior. P1-P6 (analítica, exámenes, planificación, operaciones de contenido, multi-dispositivo, IA) se diseñan en detalle cuando se llegue a ellos, no ahora — construirlos antes de tener P0 sólido violaría el principio "no implementar todo a la vez" de la especificación.

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un evento mal emitido (o `recordStudyEvent` fallando) rompe una acción de usuario ya validada (guardar un test, marcar un tema) | Emisión de eventos siempre DESPUÉS de que la escritura principal tenga éxito, envuelta en su propio try/catch que solo loggea — nunca puede hacer fallar `recordQuizSession`/`markTopicStudied`. Test explícito por escritor. |
| Crecimiento sin límite de `studyEvents` degrada rendimiento con el tiempo | Fuera de alcance de Fase 1 optimizar (dataset de un único usuario, meses de uso son miles de filas, no millones) — se revisita si `npm run build`/consultas muestran degradación real; no se opera de forma especulativa. |
| Migración Dexie con `.upgrade()` mal escrita pierde datos silenciosamente | Ninguna migración se declara sin su test de "datos de v(N-1) sobreviven" ejecutándose en verde ANTES del commit. Ver sección 6. |
| Bundle principal (862.78 kB hoy) crece con cada feature nueva | Cada fase con UI nueva no trivial (analítics, calendario, simulacros, tutor IA, búsqueda) se carga con `React.lazy` desde el primer commit que la introduce — nunca se añade a `main` a pelo y se optimiza "después". |
| Contaminación del contenido canónico por error humano (p. ej. un futuro desarrollador escribe en `src/data/*.json` a mano) | Sin cambios de proceso adicionales: el pipeline de integridad (SHA gate + `verify-content`) ya detecta y bloquea esto; se ejecuta en cada quality gate de cada fase (sección 8). |
| Un contribuidor (o un asistente de IA en una sesión futura) intenta "arreglar" un test bajando su exigencia para que pase | Ninguna fase de esta iniciativa relaja una aserción existente para hacer pasar CI — si un test falla, se corrige el código, nunca el test (salvo que el propio test tuviera un bug real, documentado explícitamente como tal). |
| CI no valida Android (`build:android` + Gradle) | Aceptado como riesgo conocido para P0 (no bloquea Fases 1-3, que no tocan comportamiento nativo); se revisita como mejora en Fase 22+ (operaciones de contenido) o antes si una fase concreta lo requiere. |

---

## 6. Estrategia de rollback

- **Por fase:** cada fase vive en commits pequeños y encadenados sobre `feat/study-intelligence`. Un `git revert` de los commits de una fase concreta es seguro porque cada fase añade una versión Dexie nueva (aditiva) — revertir el código de la Fase N no dobla la versión Dexie hacia atrás (Dexie no soporta bajar de versión), pero como la tabla nueva simplemente deja de usarse, no hay pérdida de datos existentes de fases anteriores.
- **Por rama:** `feat/study-intelligence` nunca se mergea a `main`/`feat/capacitor-android-foundation` hasta que P0 completo pase el quality gate y se valide manualmente en Android. Mientras tanto, ambas ramas son independientes — un problema en `feat/study-intelligence` no afecta la app que ya usa el usuario en su dispositivo real.
- **Datos del usuario:** ninguna migración borra ni transforma destructivamente `topicProgress`/`flashcardProgress`/`quizSessions`/`quizAnswers`/`appMeta`. El "rollback" de una migración Dexie fallida es, en la práctica, "el usuario sigue en la versión de la app anterior a que la migración se publicara" — de ahí que cada `.upgrade()` se pruebe exhaustivamente ANTES de mergear, nunca se depure en producción.

---

## 7. Consideraciones de privacidad

- Todos los datos de Study Intelligence (eventos, errores, notas, favoritos, planificación, calendario) son **locales por defecto** — se guardan en Dexie/IndexedDB en el dispositivo, igual que el progreso actual. Ninguna fase de P0-P4 introduce una llamada de red para funcionalidad núcleo.
- `metadata` en `StudyEvent` es un campo libre pero controlado: cada emisor decide explícitamente qué guarda ahí (p. ej. nunca texto libre introducido por el usuario en un futuro campo de notas, que vive en su propia tabla `notes` con su propio ciclo de vida — nunca se duplica dentro de un evento).
- Cuando llegue la Fase 27 (sync opcional) y la Fase 29-32 (IA), este documento se actualizará con una sección específica de qué datos saldrían del dispositivo, hacia dónde, y con qué consentimiento explícito — no antes, porque no existen todavía.

---

## 8. Comportamiento offline

Ninguna fase P0-P4 depende de red. `studyEvents`, `errorRecords`, `questionBookmarks`, `notes`, `flashcardSchedule` son tablas Dexie locales — funcionan idéntico con o sin conexión, igual que `topicProgress`/`quizSessions` hoy. La búsqueda global (Fase 6) es local-first sobre los mismos datos ya embebidos en el bundle (sin índice de búsqueda de terceros que requiera red). El precache de Workbox (`vite-plugin-pwa`) seguirá cubriendo el app shell; no hace falta tocar `workbox.globPatterns` para P0 porque no se añade ningún asset nuevo servido por red — todo el código de las fases nuevas se embebe en el bundle igual que hoy.

---

## 9. Implicaciones para Android

Fases 1-8 (P0) no requieren ningún cambio en `android/`, `capacitor.config.ts` ni `vite.config.ts` — son tablas Dexie (IndexedDB funciona igual dentro del WebView de Capacitor que en un navegador) y rutas/componentes React nuevos bajo el mismo `AppRouter`. Se valida igualmente con el ritual completo de la especificación (`rm -rf dist && npm run build:android && npx cap sync android && cd android && ./gradlew assembleDebug`) al cierre de cada fase que toque UI visible, para detectar pronto cualquier regresión de bundle/rutas en el contexto nativo — no porque se espere que rompa algo, sino porque es la validación barata que evita sorpresas costosas más adelante (Fase 17+ con simulacros cronometrados sí tendrá implicaciones reales de Android: `setInterval` en segundo plano, ciclo de vida de la Activity, etc. — se diseñará entonces).

---

## 10. Estrategia de test

Cada fase añade, como mínimo:

1. **Tests de migración Dexie** (`fake-indexeddb`, patrón ya usado en `db.test.ts`) — la tabla/versión nueva no corrompe ni pierde nada de versiones anteriores.
2. **Tests del servicio de dominio puro** (sin React) — casos borde explícitos por fase (ver la lista exhaustiva ya dada en la especificación: nueva vs. repetida vs. recuperada para errores; Again/Hard/Good/Easy y vencimientos para repetición espaciada; mismo día/consecutivo/perdido/frontera horaria para rachas; etc.).
3. **Tests de integración ligera** con Testing Library donde haya UI nueva relevante (patrón ya usado en `Quiz.test.tsx`/`Study.test.tsx`/`Flashcards.test.tsx`).
4. **Cero regresión**: los 29 tests de Node + 76 de Vitest existentes (cifra de hoy, sección 1.1) deben seguir en verde en cada commit — el quality gate (sección 11) lo garantiza mecánicamente, no por revisión manual.

---

## 11. Quality gate (recordatorio operativo)

Al final de cada fase, en este orden, y ninguna fase se da por cerrada si algo de esto falla:

```
npm run verify-content
npm run typecheck
npm run lint
npm run test
npm run build
# equivalente combinado: npm run check
```

Si la fase toca comportamiento visible/nativo, además:

```
rm -rf dist
npm run build:android
npx cap sync android
cd android && ./gradlew assembleDebug && cd ..
```

Nunca se declara un resultado en el informe de fase sin haber ejecutado realmente el comando correspondiente.

---

## 12. Fases futuras (P1-P6) — resumen de intención, sin diseño detallado todavía

Se documentan en detalle cuando se llegue a ellas, siguiendo el mismo formato de esta sección 1-11 (arquitectura, entidades, migración, riesgos, rollback, privacidad, offline, Android, tests). Referencia rápida de alcance (ver la especificación completa entregada por el usuario para el detalle fase a fase):

- **P1 — Analítica** (Fases 9-14): metas, tiempo de estudio consciente de actividad, rachas con límites horarios, dominio de tema explicable, dashboard de progreso, motor de debilidades determinista.
- **P2 — Preparación de examen** (Fases 15-18): modo Entrenamiento vs. modo Examen, `ExamSpecification` versionado, simulacros oficiales con penalización, historial comparativo.
- **P3 — Planificación** (Fases 19-21): planificador adaptativo que rebalancea (no "falla") ante días perdidos, calendario, cobertura de temario oficial vs. disponible vs. completado (con datos, nunca strings de UI hardcodeados).
- **P4 — Operaciones de contenido** (Fases 22-26): versionado académico (`ContentSource`/`ContentRevision`, nunca sobrescribe el origen), pipeline de importación de temario nuevo (staging → validación → preview → promoción transaccional, mismo patrón que `extract-content.mjs`), backup/export/import versionado de datos personales, ajustes, accesibilidad.
- **P5 — Multi-dispositivo** (Fases 27-28): arquitectura de sync opcional (`SyncProvider`/`AuthProvider`, ADR obligatorio antes de cualquier backend, RLS si es Supabase, conflictos explícitos por tipo de dato), cuentas solo si el sync lo exige — nunca bloqueando el uso local.
- **P6 — IA** (Fases 29-34): fundación de proveedor de IA (nunca claves en frontend, degradación explícita sin proveedor), Tutor C1 con RAG grounded exclusivamente en material propio y citas de fuente, preguntas generadas SIEMPRE separadas del banco canónico y etiquetadas, explicaciones de IA nunca guardadas como texto canónico, motor de recomendación determinista primero, heurística de riesgo de olvido explícitamente no presentada como ML real salvo que exista un modelo real.

---

## 13. Registro de decisiones (ADRs relacionados)

Se crea un ADR nuevo cuando esta iniciativa tome una decisión arquitectónica significativa (algoritmo de repetición espaciada, modelo de puntuación de dominio, formato de simulacro, formato de backup, sync en la nube, arquitectura de IA, arquitectura de búsqueda) — no antes de que esa fase se diseñe en detalle. Índice (se completa progresivamente):

- `docs/adr/0009-...` — (pendiente, Fase 7: algoritmo de repetición espaciada)
- `docs/adr/0010-...` — (pendiente, Fase 12: modelo de puntuación de dominio)
- `docs/adr/0011-...` — (pendiente, Fase 17: modelo de simulacro)
