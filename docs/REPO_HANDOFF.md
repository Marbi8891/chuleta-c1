# REPO_HANDOFF — estado del repositorio

Este documento describe **el proyecto React completo tal y como existe
hoy** (Fase 2B), no solo la capa de datos original de la Fase 1.5B. Si
buscas solo el histórico de cómo se migró el contenido académico
(extracción, validación, IDs estables), esa parte sigue documentada en
`docs/DATA_INTEGRITY.md` y en `docs/adr/0001`-`0003`; este fichero cubre
el árbol entero, incluida la app React (Fase 2) y el despliegue estático
(Fase 2B).

## Qué es este repositorio

Una PWA de estudio para el Cuerpo General Administrativo del Estado
(C1): temario (25 temas), tests (25 bancos / 500 preguntas) y
flashcards (165). Empezó como un único fichero HTML/JS
(`legacy/index.original.html`, conservado tal cual como referencia y
fuente de verdad para la migración de contenido) y se está migrando
progresivamente a React + TypeScript + Vite, con la vista puesta en
Capacitor/Android en una fase futura. El contenido académico es
sacrosanto en todas las fases: cualquier cambio en él pasa por el
pipeline de `scripts/`, nunca por edición manual de los JSON de datos.

## Árbol del proyecto

```
legacy/index.original.html         App original de una sola página (referencia, no se sirve).

scripts/                           Pipeline de extracción/verificación de contenido.
  extract-content.mjs              Extrae los datos de legacy/ → src/data/*.json (transaccional, con SHA gate).
  verify-content.mjs               Verifica equivalencia legacy ⇄ datos extraídos + non-regression floor.
  lib/extract.mjs, validate.mjs, diff.mjs   Lógica compartida del pipeline.

src/
  data/                            Contenido académico extraído (JSON) + acceso tipado.
    study_bank.json, quiz_bank.json, flashcards.json
    ids.ts, ids.impl.mjs, ids.impl.d.mts   IDs globales estables de pregunta.
    index.ts                       getTopics/getQuestions/getQuestionById/getFlashcards, etc.
    topics.ts                      Bloques y temas (metadatos de navegación, no contenido extraído).
    index.test.ts                  Tests Vitest de la capa de acceso a datos.
  types/                           Tipos compartidos del dominio (content, study, quiz, flashcard).
  app/                             Shell de la aplicación: routing, layout, estado de alcance/quiz.
    App.tsx                        BrowserRouter (basename dinámico, ver ADR-0005) + providers.
    App.test.tsx
    AppLayout.tsx                  Cabecera, navegación inferior, panel de alcance.
    BottomNav.tsx
    router.tsx                     Definición de rutas (/, study, study/:topicId, quiz/*, flashcards).
    ScopeContext.tsx / ScopePanel.tsx   Selección de temas ("Alcance") compartida entre Estudiar/Test/Flashcards.
    QuizContext.tsx                Estado y lógica del motor de test.
    StatsStrip.tsx
  features/                        Una carpeta por pantalla/funcionalidad, features/<area>/*.
    home/                          Portada ("Hoy").
    study/                         Estudiar (listado de temas + artículo).
    quiz/                          Configurar/ejecutar/resultados de test.
    flashcards/                    Flashcards (cola, volteo, dominadas).
  state/                           Estado persistente de progreso del usuario (localStorage, NO Dexie todavía).
    appState.ts                    Store externo (known/studied/quizHistory/studyFsIndex) + get/subscribe.
    useAppState.ts                 Hook useSyncExternalStore sobre appState.ts.
  deploy/                          Lógica del despliegue estático en GitHub Pages (ver ADR-0005).
    githubPagesSpaRedirect.ts      encode/decodeRedirectUrl — puras, testeadas.
    githubPagesSpaRedirect.test.ts
    404-entry.ts                   Entry point de 404.html.
  theme/                           CSS (tokens, estilos globales, estilos de la app). Sin CSS-in-JS.
    tokens.css, global.css, app.css
  test/                            Utilidades de test compartidas (no contenido de producción).
    renderWithProviders.tsx
  main.tsx                         Entry point: decodifica redirección de GitHub Pages y monta <App/>.
  setupTests.ts                    Setup de Vitest/Testing Library (jest-dom, etc.).
  vite-env.d.ts

index.html                         Entrada HTML principal de Vite (raíz del proyecto, no en public/).
404.html                           Segunda entrada HTML de Vite — ver ADR-0005 (GitHub Pages SPA redirect).
vite.config.ts                     Config de Vite: base condicional, doble entrada HTML, config de Vitest.
eslint.config.js                   ESLint 9 flat config (TypeScript + React Hooks + React Refresh).
.prettierrc.json                   Config de Prettier.
tsconfig.json                      Config de TypeScript.
.nvmrc                             Versión de Node fijada para desarrollo/CI (ver docs/adr/0003, punto Node abajo).
.gitignore

public/                            Estáticos servidos tal cual, sin procesar por Vite (salvo lo listado abajo).
  manifest.webmanifest             Referenciado desde index.html vía %BASE_URL% (ver ADR-0005).
  icons/                           Iconos de la PWA (192/512, normal y maskable).

tests/                             Tests Node nativos (node:test) del pipeline de contenido — NO Vitest.
  helpers/fixture.mjs
  legacy-equivalence.test.mjs
  pipeline.test.mjs
  validate.test.mjs

docs/
  REPO_HANDOFF.md                  Este fichero.
  DATA_INTEGRITY.md                Contrato de integridad del contenido académico.
  adr/
    0001-offline-data-bundling.md
    0002-persistence-layer.md
    0003-node-tooling-portability.md
    0004-react-app-architecture.md   Arquitectura de la app React (Fase 2) + deuda de fuentes offline (Fase 2B/4).
    0005-github-pages-deployment.md  Despliegue estático, routing, base/basename (Fase 2B).

.github/workflows/
  deploy-pages.yml                 Build + publicación en GitHub Pages (ver ADR-0005).

CONTENT_INTEGRITY.json             Metadatos de integridad del contenido (hash de legacy, floor de non-regression).
package.json                       Scripts, dependencias, engines.node.
package-lock.json                  **Parte del repo — ver más abajo.**
```

Los tests Vitest (`*.test.tsx`/`*.test.ts` dentro de `src/`) y los tests
Node nativos (`tests/*.test.mjs`) son dos suites independientes con
runners distintos; `npm run test` ejecuta ambas (ver `package.json`).

## `package-lock.json` es parte del repo

`package-lock.json` **debe** committearse y mantenerse actualizado junto
a `package.json`. No es un artefacto regenerable a ignorar: fija
exactamente las mismas versiones transitivas en local, en CI y en el
build de despliegue, y es lo que permite usar `npm ci` (instalación
limpia y reproducible, requerida por Fase 2B punto 7 y usada en
`.github/workflows/deploy-pages.yml`) en lugar de `npm install`. Cambiar
una dependencia sin commitear el lockfile actualizado es un error, no una
opción de estilo.

(Nota histórica: una versión anterior de este documento, de cuando el
repositorio solo contenía la capa de datos extraída de Fase 1.5B y aún
no existía la app React, decía que copiar React/Vite al repo real era
trabajo pendiente y trataba `package-lock.json` como opcional. Ya no es
así: la app React completa vive en este repositorio desde la Fase 2, y el
lockfile se commitea siempre.)

## Instalación y comandos

```
npm ci                 # instalación limpia y reproducible (usa package-lock.json)
npm run dev             # servidor de desarrollo Vite (base "/", ver ADR-0005)
npm run build            # build de producción (base "/chuleta-c1/")
npm run preview          # sirve el build de producción localmente
npm run verify-content    # valida el contenido académico extraído contra legacy/
npm run typecheck         # tsc --noEmit
npm run lint               # ESLint sobre todo el proyecto
npm run test                # tests Node nativos (tests/*.test.mjs) + Vitest (src/**/*.test.{ts,tsx})
npm run check                 # verify-content + typecheck + lint + test + build, en ese orden
```

Node: ver `.nvmrc` (fija la versión exacta usada en desarrollo y en CI,
vía `actions/setup-node` con `node-version-file`). `engines.node` en
`package.json` documenta el mínimo soportado, no necesariamente la misma
versión que `.nvmrc` — ver la nota en el ADR-0004 sobre esto.

## Qué NO hay todavía (deuda conocida, fases futuras)

- **Persistencia con Dexie/IndexedDB** — Fase 3. Hoy `src/state/appState.ts`
  sigue usando `localStorage` con la misma clave y forma que la app
  legacy, a propósito, para no perder el progreso de usuarios existentes.
- **Capacitor / Android** — Fase 4/5. `import.meta.env.BASE_URL` ya está
  desacoplado del nombre del repo en el código de rutas (ver ADR-0005)
  para que esa fase no tenga que tocar routing.
- **Fuentes offline** — las fuentes (Google Fonts) se cargan hoy desde
  CDN vía `<link>` en `index.html`; para un runtime PWA/Capacitor
  totalmente offline habrá que empaquetarlas localmente o sustituirlas.
  Ver ADR-0004.

## Convención de ramas y commits

Trabajo en curso en `feat/react-capacitor-foundation`. Commits separados
por preocupación (no mezclar cambios de contenido académico, capa de
datos, app React y despliegue en el mismo commit), siguiendo el estilo ya
usado en el historial de esta rama (`fix(content): ...`,
`feat(app): ...`, `docs(...): ...`, etc.).
