# PWA_ARCHITECTURE — Fase 4: PWA OFFLINE FOUNDATION

Este documento describe cómo Chuleta C1 funciona sin conexión tras una
primera visita online: manifest, Service Worker, precache, navegación
offline, ciclo de vida de actualización, separación caché/Dexie, bundle,
y qué queda pendiente para la Fase 5 (Capacitor). Para el razonamiento
de "por qué esta solución y no otra", ver `docs/adr/0007-pwa-vite-plugin-pwa.md`.
Para el estado exacto de la auditoría de dependencias que precedió a esta
fase (obligatoria antes de tocar nada de PWA), ver
`docs/DEPENDENCY_AUDIT.md`.

## Manifest

Generado por `vite-plugin-pwa` desde `vite.config.ts` (ya no existe
`public/manifest.webmanifest` como fichero estático — lo genera el
plugin en cada build, ver ADR-0007). Campos clave:

| Campo | Valor | Motivo |
|---|---|---|
| `name`/`short_name` | `"Chuleta C1"` | Literal de la especificación de Fase 4 |
| `start_url`/`scope` | `"."` | Relativo a la ubicación del propio manifest — funciona igual en dev (`/`), GitHub Pages (`/chuleta-c1/`) y una futura build de Capacitor |
| `display` | `"standalone"` | Pantalla completa tipo app, sin la barra de navegador |
| `orientation` | `"any"` | La especificación lo pide explícitamente (la app es usable en cualquier orientación, no solo portrait) |
| `background_color`/`theme_color` | `#faf7f0`/`#1c2b4a` | Los mismos tokens `--bg`/`--ink` que ya usaba la app — ningún color nuevo |
| `icons` | 192/512, normal + maskable | Ya existían en `public/icons/` desde la Fase 2 (inicialización del proyecto Vite) — no se ha generado ni inventado ningún icono nuevo en esta fase |

`index.html` ya no escribe el `<link rel="manifest">` a mano — lo inyecta
`vite-plugin-pwa` con la ruta correcta según `base` (ver el build de
producción: `<link rel="manifest" href="/chuleta-c1/manifest.webmanifest">`).

## Runtime completamente local (cero CDNs)

Antes de esta fase, `index.html` cargaba tipografías desde
`fonts.googleapis.com`/`fonts.gstatic.com` — la app no podía renderizar su
tipografía real sin red. Se han retirado esos `<link>` por completo. En su
lugar, `src/theme/tokens.css` define tres tokens de fuente basados en
pilas de **fuentes del sistema** (nunca se han descargado binarios de
fuente de terceros para esta tarea, tal y como pide la especificación):

- `--font-display` (Georgia y afines) — titulares y cuerpo de artículo,
  en el lugar donde antes iba Fraunces.
- `--font-sans` (la sans-serif nativa del SO) — el resto de la interfaz,
  en el lugar donde antes iba IBM Plex Sans.
- `--font-mono` (la monoespaciada nativa del SO) — cifras, puntuaciones,
  badges, en el lugar donde antes iba IBM Plex Mono.

Verificado (Fase 4, punto 3): `grep` sobre `index.html`/`src/**/*.css` no
encuentra ninguna referencia a `fonts.googleapis.com`, `fonts.gstatic.com`
ni ningún otro host de CDN — la única aparición de `https://` en todo
`src/` está dentro de comentarios que documentan la URL de GitHub Pages,
nunca en una petición real.

## Service Worker: precache (Workbox `generateSW`)

`vite-plugin-pwa` en modo `generateSW` (ver ADR-0007) genera `dist/sw.js`
en cada build, con Workbox por debajo. Precachea:

- El shell (HTML/CSS/JS del build, incluidos los chunks de rutas
  perezosas — ver "Bundle y offline" más abajo).
- Los cuatro iconos y el propio `manifest.webmanifest`.
- El contenido académico (temario/tests/flashcards) — no aparece como
  ficheros JSON sueltos en el precache porque va empaquetado dentro de
  los chunks JS del build (decisión de la Fase 1, ADR-0001, que esta fase
  no toca): al precachear los chunks, el contenido queda disponible
  offline sin ninguna petición de red adicional.

Build de referencia (branch `feat/react-capacitor-foundation`, tras esta
fase): `PWA v1.3.0 · mode generateSW · precache 24 entries (1070.74 KiB)`.

**No hay `runtimeCaching`** en la configuración — no hace falta: no
existe ninguna petición de red en tiempo de ejecución que cachear (cero
CDNs, ver arriba) ni ninguna que excluir a propósito (GitHub API,
analítica, etc. nunca se llaman desde esta app).

## Rutas offline

La app usa `BrowserRouter` (ver ADR-0005) — cada ruta (`/study/I-T01`,
`/quiz/run`, etc.) es una URL real, no un fragmento `#`. Dos mecanismos
para "ruta que no es un fichero real" coexisten sin pisarse:

1. **GitHub Pages, online, primera visita a una URL profunda**: GitHub
   Pages sirve `404.html`, que redirige (vía query string, ver
   `src/deploy/githubPagesSpaRedirect.ts`) a `index.html` con la ruta
   original — mecanismo ya existente desde la Fase 2B, sin cambios.
2. **Service Worker, offline (o ya controlado), cualquier visita
   posterior**: Workbox registra un `NavigationRoute` con
   `createHandlerBoundToURL('index.html')` como fallback — cualquier
   navegación a una ruta de la app que no coincida con un fichero
   precacheado exacto se sirve desde el `index.html` ya en caché, y React
   Router toma el control desde ahí en el cliente. `404.html` queda fuera
   de ese fallback (`navigateFallbackDenylist`, ver `vite.config.ts`) como
   cinturón de seguridad explícito — en la práctica nunca compite de
   verdad porque `404.html` tiene su propia entrada de precache exacta,
   que Workbox resuelve antes de llegar al fallback genérico.

Verificado con `scripts/pwa-offline-acceptance.mjs` contra el build de
producción real servido con `base: '/chuleta-c1/'` (17/17 comprobaciones
en verde — ver el checkpoint de la Fase 4 para el detalle): con la red
completamente desconectada (`context.setOffline(true)`, no solo peticiones
bloqueadas una a una), una recarga dura en `/`, `/study`,
`/study/I-T01` (ruta profunda), `/quiz` y `/flashcards` carga el shell
correctamente; `/quiz/run` como recarga directa también sirve el shell sin
error de red (el propio guard de la app — "no hay test en curso" — es
comportamiento correcto, no un fallo de esta fase). La navegación cliente
normal (bottom-nav) también funciona offline.

## Ciclo de vida de actualización (seguro, nunca automático)

`registerType: 'prompt'` (nunca `'autoUpdate'`, ver ADR-0007). Ciclo real:

```
INSTALL   → el navegador descarga el sw.js nuevo en segundo plano.
WAITING   → el SW nuevo termina de instalarse pero NO toma el control
            todavía (el SW anterior sigue activo controlando la pestaña
            abierta) — vite-plugin-pwa expone esto como needRefresh=true
            (ver src/pwa/useServiceWorkerUpdate.ts). NINGÚN reload ocurre
            aquí.
UI        → UpdateBanner (src/pwa/UpdateBanner.tsx) muestra "Nueva
            versión disponible" + botón "Actualizar". Ningún useEffect
            reacciona a este estado recargando por su cuenta.
ACTIVATION → solo si el usuario pulsa "Actualizar": se envía skipWaiting
            al SW en espera.
RELOAD    → tras la activación, la librería recarga la pestaña — pero
            esto SOLO puede ocurrir tras esa pulsación explícita.
```

Verificado de extremo a extremo con
`scripts/pwa-update-lifecycle-acceptance.mjs` (8/8 en verde): con un test
de 1 pregunta respondida pero SIN guardar en pantalla, se genera un
segundo build (contenido de `index.html` distinto → precache/sw.js
distintos) y se fuerza la comprobación de actualización
(`registration.update()`). El nuevo Service Worker llega a estado
`waiting`; tras esperar varios segundos, la pregunta sigue exactamente
igual en pantalla y no ha habido ninguna navegación — solo al pulsar
"Actualizar" la página se recarga y queda controlada por el nuevo SW.

## Separación caché / persistencia (invariante de durabilidad)

**El Service Worker NUNCA toca IndexedDB ni `localStorage`.** No es solo
una intención de diseño: es una garantía estructural de usar la
estrategia `generateSW` de Workbox (ver ADR-0007) en vez de escribir un
SW a mano — el `sw.js`/`workbox-*.js` generados no contienen ninguna
llamada a esas APIs porque Workbox, en este modo, solo gestiona Cache
Storage (precache + `cleanupOutdatedCaches()`, que limpia versiones
ANTIGUAS de caché, nunca datos de usuario). Verificado empíricamente en
cada build: `grep -i "indexeddb\|localstorage" dist/sw.js dist/workbox-*.js`
no encuentra ninguna coincidencia.

En consecuencia, y sin necesidad de código defensivo adicional:

- `DB_NAME` (`src/db/schema.ts`) no se ha tocado en esta fase.
- `localStorage["chuletaC1_v1"]` (fuente legacy congelada desde la Fase
  3, ver `docs/LEGACY_MIGRATION.md`) no se ha tocado.
- Ninguna fase de `install`/`activate`/limpieza de caché puede borrar
  progreso de usuario — estructuralmente no tienen acceso a esas APIs.

Verificado también end-to-end: tras generar progreso real (una sesión de
test completa, una flashcard marcada) online, pasar a offline y navegar,
`indexedDB.open('chuletaC1')` sigue devolviendo esas mismas filas (ver
`scripts/pwa-offline-acceptance.mjs`, comprobación "PROGRESO SOBREVIVE
OFFLINE").

## Bundle y offline

Antes de esta fase: un único chunk `main.js` de 1.026 kB (309 kB gzip).
Investigado (no una optimización a ciegas): `react-markdown` + `remark-gfm`
(el ecosistema `unified`/`micromark` con sus extensiones GFM, usado
únicamente por `StudyArticlePage` para renderizar el markdown de los
apuntes) pesa cerca de 1 MB en `node_modules` — el mayor contribuyente
evitable identificado. Solución: `React.lazy` a nivel de ruta para
Estudiar/Test/Flashcards (ver `src/app/router.tsx`) — cada uno pasa a ser
su propio chunk, cargado solo cuando se visita esa sección.

Resultado medido:

| | Antes | Después |
|---|---|---|
| Chunk principal | 1.026,33 kB (308,91 kB gzip) | 859,57 kB (258,64 kB gzip) |
| `StudyArticlePage` (react-markdown) | *(incluido en el principal)* | 160,30 kB (48,83 kB gzip), aparte |
| Resto de páginas perezosas | *(incluido en el principal)* | 1,20–4,61 kB cada una |
| Entradas de precache | 16 (1024,87 KiB aprox.) | 24 (1070,74 KiB) |

**Esto no es "lazy-fetch de contenido académico"** (explícitamente
prohibido en la especificación): los tres JSON de temario/tests/
flashcards siguen empaquetados como módulos ES en tiempo de build (ADR-0001,
sin cambios) — ningún dato se pide por red en ningún momento.
`React.lazy` solo difiere CUÁNDO el navegador pide un chunk de JS ya
generado en el propio build; ese chunk queda precacheado por el Service
Worker igual que el resto (`workbox.globPatterns` cubre todo `dist/assets/*.js`
sin distinción), así que sigue disponible offline tras la primera visita
— comprobado explícitamente visitando `/study/I-T01` (la ruta que carga
el chunk de react-markdown) en el test de aceptación offline.

El chunk principal (860 kB) sigue por encima del umbral de aviso de Vite
(500 kB) — es, en su mayoría, React + React DOM + React Router + Dexie +
el propio contenido académico, todo necesario para que la app funcione
offline desde el primer render. Dividirlo más (por ejemplo, un chunk
"vendor" aparte para React/React DOM) es una optimización legítima para
una fase futura, pero no se ha perseguido aquí a ciegas: la especificación
prioriza explícitamente "offline-first" sobre perseguir un número de
bundle más pequeño, y el contribuyente realmente evitable (react-markdown)
ya se ha aislado con evidencia, no por intuición.

## Instalabilidad

Verificado sobre el build de producción real (`vite preview --base /chuleta-c1/`):

- Manifest detectado por el navegador (`<link rel="manifest">` con la
  ruta correcta bajo `base`).
- Service Worker registrado y activo, con `scope` correcto
  (`http://.../chuleta-c1/`).
- Los cuatro iconos declarados en el manifest existen realmente en
  `dist/icons/` y se sirven con código 200.
- `start_url` (`.`) resuelve a la propia app.
- Lanzamiento en modo standalone: cubierto por `display: 'standalone'`
  en el manifest — no se ha añadido un botón "Instalar app" propio (la UI
  nativa del navegador es suficiente para esta fase, tal y como pide la
  especificación).

## Consideraciones para Capacitor (Fase 5 — fuera de alcance aquí)

No se ha instalado `@capacitor/core`/`@capacitor/cli`/`@capacitor/android`,
ni se ha creado `capacitor.config.*` ni `android/` — explícitamente fuera
de esta fase. Puntos que la Fase 5 deberá decidir, no resueltos aquí:

- Si el WebView de Capacitor debe usar este mismo Service Worker
  (Capacitor sirve la app desde un origen propio tipo
  `capacitor://localhost`, donde un SW es técnicamente viable pero
  redundante con el propio empaquetado nativo de assets) o si el offline
  en Android se resuelve solo con los ficheros embebidos en el APK.
  `start_url`/`scope` del manifest ya están pensados como relativos
  (`"."`) precisamente para no depender de `base` y no tener que tocar el
  manifest cuando llegue esa decisión.
- Si `registerType: 'prompt'` (recarga de pestaña) tiene sentido dentro
  de un WebView nativo, donde "recargar" tiene una semántica distinta a
  la de una pestaña de navegador.
