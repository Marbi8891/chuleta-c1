# ADR-0007: PWA offline con vite-plugin-pwa (Workbox generateSW) y actualización manual (Fase 4)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

La Fase 4 pide que la app funcione completamente offline tras una visita
online: shell, temario, tests y flashcards deben cargar sin red, y el
progreso en IndexedDB debe seguir disponible. La especificación exige
explícitamente usar "una solución Vite-compatible madura" y no escribir un
Service Worker grande a mano sin buena razón, mantener compatibilidad con
GitHub Pages (`base: '/chuleta-c1/'`, ver ADR-0005) y con la futura build
de Capacitor, y adoptar una estrategia de actualización conservadora que
nunca reemplace la app en ejecución sin avisar.

## Decisión 1: `vite-plugin-pwa` en modo `generateSW`

Se usa `vite-plugin-pwa` (Workbox por debajo) en vez de escribir el
Service Worker a mano. Dentro de sus dos estrategias:

- **`generateSW`** (la elegida): Workbox genera el SW completo a partir de
  configuración declarativa (`vite.config.ts`). No hay ninguna lógica de
  caché a medida que justifique lo contrario — solo hace falta precachear
  el app shell y los assets del build, que es exactamente lo que resuelve
  de fábrica.
- `injectManifest`: exigiría mantener un `sw.js` propio con el precache
  inyectado por el plugin. Se descarta: más superficie de código propio
  que mantener y más riesgo de bug, sin ninguna necesidad real detrás (no
  hay `runtimeCaching` complejo, ni push notifications, ni background
  sync en el alcance de esta fase).

Configuración relevante (ver `vite.config.ts`):

- `registerType: 'prompt'` — nunca `'autoUpdate'` (ver Decisión 3).
- `injectRegister: false` — el registro se hace a mano desde
  `src/pwa/useServiceWorkerUpdate.ts` (vía `virtual:pwa-register/react`),
  no automáticamente al inyectar un `<script>` en `index.html`. Así la UI
  de actualización tiene control total del ciclo de vida.
- `manifest` se declara inline (no como fichero estático en `public/`,
  que existía como boilerplate desde la inicialización del proyecto en la
  Fase 2 y se ha retirado en esta fase) — así el plugin puede inyectar
  correctamente el `<link rel="manifest">` con el `base` real y regenerar
  el fichero en cada build sin desincronizarse a mano.
- `workbox.globPatterns` incluye JS/CSS/HTML/PNG/SVG/ICO/webmanifest — el
  contenido académico (temario, tests, flashcards) no aparece aparte
  porque va empaquetado dentro de los propios chunks JS (ver ADR-0001,
  "offline data bundling" — decisión de la Fase 1 que la Fase 4 no
  modifica en absoluto, solo se apoya en ella).
- `workbox.navigateFallback` se deja en su valor por defecto
  (`"index.html"`, resuelto por el plugin contra `base`) en vez de fijarlo
  a mano — comprobado en el build de producción que el precache manifest
  y el registro `NavigationRoute` quedan correctamente bajo
  `/chuleta-c1/`, igual que el resto del bundle (ver
  `docs/PWA_ARCHITECTURE.md`, sección "Rutas offline").
- `devOptions.enabled: false` — el SW no se activa en `npm run dev`; solo
  tiene sentido sobre un build de producción real.

## Decisión 2: manifest — campos exactos, sin branding inventado

`name`/`short_name` = "Chuleta C1" (literal, tal y como pide la
especificación); `display: 'standalone'`; `orientation: 'any'`;
`background_color`/`theme_color` reutilizan los tokens `--bg`/`--ink` ya
existentes (`#faf7f0`/`#1c2b4a`) — ningún color nuevo. `start_url`/`scope`
= `'.'` (relativos a dónde se sirva el propio manifest), para que
funcionen igual bajo `/` (dev, y la futura build de Capacitor) y bajo
`/chuleta-c1/` (GitHub Pages) sin acoplar el manifest a un `base`
concreto. Los cuatro iconos (192/512, normal/maskable) ya existían en
`public/icons/` desde la inicialización del proyecto — no se ha generado
ni inventado ningún icono nuevo para esta fase.

## Decisión 3: actualización manual (`registerType: 'prompt'`), nunca `autoUpdate`

`autoUpdate` reemplazaría la app en ejecución y recargaría la pestaña en
cuanto un nuevo SW estuviera listo — exactamente lo que la especificación
prohíbe ("no silently replace a running application in a way that risks
losing an in-progress quiz"). Con `'prompt'`, un nuevo SW se instala en
segundo plano y se queda en estado `waiting`; `useRegisterSW` (del cliente
React de vite-plugin-pwa) expone eso como `needRefresh`, que
`UpdateBanner` traduce en un aviso mínimo ("Nueva versión disponible" +
botón "Actualizar") — nunca en un `useEffect` que reaccione recargando
por su cuenta. La activación (`skipWaiting` + recarga) solo ocurre dentro
del `onClick` de ese botón. Verificado de extremo a extremo con
`scripts/pwa-update-lifecycle-acceptance.mjs`: con un test de test a
medias en pantalla, tras detectar una versión nueva y esperar varios
segundos, la pregunta seguía intacta y no había habido ninguna navegación
— la recarga solo llegó tras pulsar el botón.

## Decisión 4: sin `runtimeCaching`, cero CDNs en runtime

Antes de la Fase 4 la app cargaba tipografías desde Google Fonts
(`fonts.googleapis.com`/`fonts.gstatic.com`) — un Service Worker con
`runtimeCaching` para esos orígenes habría sido una opción, pero se
descarta: la especificación pide explícitamente que la app no dependa de
ningún CDN en tiempo de ejecución, ni siquiera cacheado. En su lugar se
retiran esas fuentes por completo y se sustituyen por pilas de fuentes
del sistema (ver `src/theme/tokens.css`, tokens `--font-display`/
`--font-sans`/`--font-mono`) — nunca se han descargado binarios de fuente
de terceros para esta tarea, tal y como pide la especificación. Resultado:
`workbox.runtimeCaching` no existe en la configuración porque no hace
falta — no hay ninguna petición de red en tiempo de ejecución que
cachear ni que excluir a propósito (GitHub API, analítica, etc. nunca se
llaman desde esta app).

## Consecuencias

- Nueva dependencia de desarrollo: `vite-plugin-pwa` (y su dependencia
  `workbox-build`/`workbox-window`) — auditada en
  `docs/DEPENDENCY_AUDIT.md`, no introduce ningún hallazgo HIGH/CRITICAL
  nuevo en producción.
- El `<link rel="manifest">` y el registro del SW dejan de estar escritos
  a mano en `index.html` — los genera el plugin en cada build. Cualquier
  cambio futuro al manifest (nombre, colores, iconos) se hace en
  `vite.config.ts`, no en `public/manifest.webmanifest` (que ya no
  existe).
- Deuda explícita para una fase futura: no hay página nueva "Lista para
  usarse offline" que aproveche `offlineReady` (ya expuesto por
  `useServiceWorkerUpdate` pero sin usar en la UI) — no era un requisito
  de la Fase 4.
- La Fase 5 (Capacitor/Android) tendrá que decidir si el WebView de
  Capacitor usa este mismo Service Worker o su propio mecanismo offline
  nativo — fuera de alcance de esta fase, ver
  `docs/PWA_ARCHITECTURE.md`, sección "Consideraciones para Capacitor".
