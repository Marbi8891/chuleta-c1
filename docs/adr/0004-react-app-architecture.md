# ADR-0004: Arquitectura de la app React (Fase 2)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

La Fase 2 migra la SPA legacy de un único `index.original.html` (HTML +
`<style>` + `<script>` inline, sin build) a React + TypeScript + Vite,
manteniendo paridad funcional estricta con Estudiar/Test/Flashcards y sin
tocar el módulo de datos de la Fase 1.5B (`src/data/`).

## Decisiones

**Stack:** React 18 + React Router 6 (rutas cliente, `BrowserRouter`) +
Vite 5 + TypeScript 5 + react-markdown 9 + remark-gfm (para tablas GFM,
que react-markdown no soporta por defecto — necesario porque el temario
real usa tablas markdown). Vitest + Testing Library para tests de
componentes; ESLint 9 (flat config) + Prettier 3.

**Rutas:** `/` (Hoy, landing nueva sin equivalente legacy), `/study`,
`/study/:topicId`, `/quiz`, `/quiz/run`, `/quiz/results`, `/flashcards`.
Sin ruta para "Más" (botón deshabilitado en la bottom-nav — placeholder,
no hay contenido que mostrar todavía).

**Estado:**
- **Alcance** (`scope`, el Set de temas seleccionados) vive en
  `ScopeContext`, a nivel de toda la app — igual que la variable de módulo
  `scope` en legacy, no persistida, compartida entre Estudiar/Test/
  Flashcards.
- **Test activo** (`quizQuestions/quizIndex/quizScore/...`) vive en
  `QuizContext` con `useReducer`, también a nivel de app — necesario
  porque el botón "Hacer el test →" de un artículo de Estudiar arranca un
  test y navega directamente a `/quiz/run`, saltándose la pantalla de
  configuración, igual que `startSingleTemaQuiz()` en legacy.
- **Flashcards** (`queue/index/flipped/hideKnown`) es estado local a
  `FlashcardsPage` — no lo necesita ninguna otra feature.
- **Progreso persistente** (`studied`, `known`, `quizHistory`,
  `studyFsIndex`) sigue viviendo en `localStorage["chuletaC1_v1"]`, con la
  misma forma que legacy (`src/state/appState.ts`), expuesto a componentes
  vía `useSyncExternalStore` (`useAppState()`). Deliberadamente NO se migra
  a IndexedDB/Dexie en esta fase — eso es Fase 3.

**CSS:** migración literal (no rediseño) del `<style>` legacy a
`src/theme/tokens.css` (design tokens, tres estados de tema) y
`src/theme/global.css` (reset + clases de componente, mismos nombres de
clase que generaban las funciones `paint*()` originales). Los añadidos
nuevos de la Fase 2 (bottom-nav mobile-first, landing "Hoy", placeholders)
viven aparte en `src/theme/app.css`, para no mezclar migración con diseño
nuevo en el mismo archivo.

**Identidad de pregunta:** `QuestionRef.id` (`QuestionId` global,
`<topicId>-Q<NNN>`) se usa como key de React y como criterio de
resolución (`getQuestionById`) en todo el motor de test — nunca el índice
del array, ni siquiera dentro de un único array ya mezclado.

**Sin Capacitor/Android todavía** — fuera de alcance de esta fase (Fase
3: persistencia; Fases 4-5: Capacitor/Android).

## Deuda conocida: fuentes no empaquetadas offline (Fase 2B punto 6)

`index.html` sigue cargando "Fraunces"/"IBM Plex Sans"/"IBM Plex Mono"
desde Google Fonts vía `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
(migración literal de legacy, mismo mecanismo). Esto es aceptable
mientras la app se sirve como sitio web normal (dev, GitHub Pages): con
red disponible, no hay diferencia perceptible.

**No se resuelve en Fase 2B a propósito** — deliberadamente fuera de
alcance de esta fase (ver la especificación de Fase 2B, punto 6). Queda
documentado aquí como deuda explícita de **Fase 4 (PWA)**: para que el
runtime funcione completamente offline (requisito de una PWA instalable,
y más adelante de un build de Capacitor sin red) las fuentes tendrán que
o bien empaquetarse localmente (`@font-face` con ficheros servidos desde
`public/` o importados como asset de Vite, con `font-display: swap`) o
sustituirse por alternativas sin dependencia de red. Cualquiera de las
dos opciones implica también revisar el `Content-Security-Policy` (si se
introduce uno) y el manifest de service worker de la Fase 4 para que las
fuentes queden cacheadas/empaquetadas en la instalación.

## Limitación conocida del historial de commits

El código de esta fase se construyó de una sola vez en un workspace
temporal y se organizó en commits por área (shell/routing, Estudiar, Test,
Flashcards, tests, estilos, docs) **después** de tenerlo terminado y
verificado en conjunto — no incrementalmente. Por tanto, aunque los
commits están separados y son revisables de forma independiente, no todos
son bisectables (un `git checkout` de un commit intermedio no garantiza
`npm run check` en verde de forma aislada). Solo se ha verificado que el
estado final (HEAD) pasa `npm run check` completo.
