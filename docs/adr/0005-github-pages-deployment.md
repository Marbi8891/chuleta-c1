# ADR-0005: Despliegue en GitHub Pages (Fase 2B)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

La app debe poder desplegarse como sitio estático en GitHub Pages, en el
repositorio `Marbi8891/chuleta-c1` (página de proyecto, no de usuario), es
decir bajo `https://marbi8891.github.io/chuleta-c1/`. GitHub Pages sirve
únicamente ficheros estáticos: no sabe que `/study/I-T01` es una ruta de
cliente de React Router, así que pedir esa URL directamente (deep-link, o
refrescar la página) le pide un fichero que no existe.

## Decisión: BrowserRouter + `base` + truco de redirección en 404.html

Se ha valorado explícitamente cambiar a `HashRouter` (URLs con
`#/study/I-T01`) porque resuelve el problema sin más esfuerzo — GitHub
Pages nunca ve la parte después de `#`. Se descarta a propósito:

- URLs peores para compartir/guardar en favoritos, y menos "de app real".
- No aporta nada a la futura compatibilidad con Capacitor — Capacitor no
  tiene problema con `BrowserRouter` (la webview sirve `index.html` desde
  un origen propio, sin el problema de "ruta que no es fichero real" que
  tiene un host HTTP estático como GitHub Pages).

En su lugar se mantiene `BrowserRouter` y se resuelven los tres problemas
reales por separado:

**1. `base` de Vite.** `vite.config.ts` fija
`base: '/chuleta-c1/'` **solo en el build de producción**
(`command === 'build'`); `npm run dev` sigue sirviendo desde `/`, más
cómodo en local. Con esto, `index.html` referencia sus assets ya
compilados como `/chuleta-c1/assets/...` en vez de `/assets/...` — sin
esto, la página cargaría en blanco en GitHub Pages (pediría los JS/CSS en
la raíz del dominio, donde no existen).

**2. Referencias a `public/` en `index.html`.** El manifest y los iconos
usan `%BASE_URL%` (`<link rel="manifest" href="%BASE_URL%manifest.webmanifest" />`)
en vez de una ruta absoluta `/manifest.webmanifest` a secas — Vite solo
reescribe automáticamente las rutas de módulos reales (`<script type=module
src="/src/main.tsx">`), no atributos `href`/`src` sueltos que apunten a
`public/`.

**3. `basename` de `BrowserRouter`.** `src/app/App.tsx` pasa
`basename={import.meta.env.BASE_URL}` (recortando la barra final, y
`undefined` cuando `BASE_URL` es `"/"`) — así las rutas internas
(`/study`, `/quiz/run`, ...) se resuelven correctamente bajo
`/chuleta-c1/` en producción y bajo `/` en local, sin hardcodear el
nombre del repo en el código de rutas.

**4. Deep-link / refresco: el truco "SPA for GitHub Pages".** Patrón
conocido (rafgraph/spa-github-pages, MIT), reimplementado aquí como dos
funciones puras testeables
(`src/deploy/githubPagesSpaRedirect.ts`, con test en
`githubPagesSpaRedirect.test.ts`):

- `404.html` (entrada real de Vite, no un fichero estático copiado tal
  cual — así su `<script type=module>` recibe el mismo hashing/base que
  `index.html`) carga `src/deploy/404-entry.ts`, que llama a
  `encodeRedirectUrl()` y redirige a `/chuleta-c1/?/study/I-T01` (la ruta
  pedida, movida a un querystring sobre la raíz del sitio).
- `src/main.tsx` llama a `decodeRedirectUrl()` **antes** de montar React:
  si la URL actual lleva la marca de redirección, reconstruye la ruta
  real con `history.replaceState()`, así `BrowserRouter` la ve desde el
  primer render — sin parpadeo a la home ni pérdida de la ruta pedida.

GitHub Pages sirve `404.html` (con estado HTTP 404) para cualquier ruta no
reconocida bajo `/chuleta-c1/`, así que este mecanismo cubre tanto un
deep-link compartido como F5 en cualquier ruta de la app.

## Verificación

Cubierto por dos niveles:

1. **Unitario (Vitest, permanente):**
   `src/deploy/githubPagesSpaRedirect.test.ts` — 14 tests: casos concretos
   de codificación/decodificación (query, hash, raíz) y una tabla de
   round-trip (`encode → decode`) para las 7 rutas reales de la app.
2. **Extremo a extremo (manual, verificado en esta fase, no forma parte
   de `npm run check`):** build real (`npm run build`, con
   `base: '/chuleta-c1/'`) servido por un servidor estático mínimo que
   imita el comportamiento de GitHub Pages (responde `404.html` con
   estado 404 para cualquier ruta no mapeada a un fichero real de
   `dist/`), navegado con un Chromium real:
   - `GET /chuleta-c1/study/I-T01` directamente (sin pasar por la SPA) →
     404 inicial → redirección → la URL final vuelve a ser
     `/chuleta-c1/study/I-T01` y el artículo correcto se renderiza.
   - `GET /chuleta-c1/flashcards` directamente → misma recuperación,
     165 flashcards cargadas.
   - `GET /chuleta-c1/` → portada "Hoy" visible.
   - Sin errores de consola ni recursos (JS/CSS/iconos) servidos desde la
     ruta equivocada.

   No se ha añadido Playwright como dependencia del proyecto para esto
   (el proyecto no tenía infraestructura E2E y no se ha considerado
   justificado añadirla solo para esta comprobación) — la reproducción
   manual es: `npm run build`, servir `dist/` con cualquier servidor
   estático que devuelva `404.html` para rutas no encontradas (p. ej.
   `npx serve dist -s` no vale por sí solo — hay que apuntar
   explícitamente el 404 a `404.html`; los adaptadores oficiales de
   GitHub Pages ya lo hacen), y navegar directamente a una ruta anidada.

## Despliegue

`.github/workflows/deploy-pages.yml` construye (`npm ci && npm run build`)
y publica `dist/` con las Actions oficiales de GitHub Pages
(`actions/configure-pages` + `actions/upload-pages-artifact` +
`actions/deploy-pages`) en cada push a `main`. Usa
`actions/setup-node` con `node-version-file: '.nvmrc'` — nunca un número
de versión hardcodeado por duplicado, para no poder quedar desincronizado
del `.nvmrc` real del proyecto (ver ADR-0003 y el punto 5 de Fase 2B).

## Consecuencias

- `GITHUB_PAGES_BASE` en `vite.config.ts` y `SEGMENTS_TO_KEEP` en
  `src/deploy/404-entry.ts` están acoplados al nombre del repo
  (`chuleta-c1`, 1 segmento de ruta). Si el repo se renombra, hay que
  actualizar los dos.
- Capacitor (Fase 4/5) necesitará su propia estrategia de `base`
  (previsiblemente relativo, `./`, vía `vite build --base=./` o una
  config dedicada) — no se ha implementado en esta fase, pero
  `BrowserRouter`/`basename` ya está preparado para leerlo de
  `import.meta.env.BASE_URL` sin cambios adicionales en el código de
  rutas.
