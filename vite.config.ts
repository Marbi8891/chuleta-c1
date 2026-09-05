/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base del despliegue en GitHub Pages (proyecto Marbi8891/chuleta-c1 →
// https://marbi8891.github.io/chuleta-c1/). Solo se aplica al build de
// producción — `npm run dev` sigue sirviendo desde "/", que es más cómodo
// en local y es también lo que necesitará la futura build de Capacitor
// (que en su momento pasará su propio `base` relativo por CLI, sin tocar
// este fichero — ver docs/adr/0005-github-pages-deployment.md).
const GITHUB_PAGES_BASE = '/chuleta-c1/';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => ({
  base: command === 'build' && mode != 'capacitor' ? GITHUB_PAGES_BASE : '/',
  plugins: [
    react(),
    // Fase 4 — PWA OFFLINE FOUNDATION (ver docs/PWA_ARCHITECTURE.md y
    // docs/adr/0007-pwa-vite-plugin-pwa.md para el razonamiento completo).
    VitePWA({
      disable: mode === 'capacitor',
      // 'generateSW': Workbox genera el service worker completo a partir
      // de esta config declarativa. Se prefiere a 'injectManifest' (que
      // exigiría mantener un SW propio a mano) porque no hay ninguna
      // necesidad de lógica de caché a medida — solo precache del app
      // shell y de los assets del build, exactamente lo que 'generateSW'
      // resuelve de fábrica y de forma auditada (Workbox es la solución
      // "madura" que pide la especificación de la Fase 4, punto 1).
      strategies: 'generateSW',
      // 'prompt', NUNCA 'autoUpdate': una nueva versión no debe
      // reemplazar la app en ejecución sin avisar — ver Fase 4, punto 6
      // (estrategia de actualización segura) y src/pwa/useServiceWorkerUpdate.ts.
      registerType: 'prompt',
      // El registro del SW se hace a mano desde
      // src/pwa/useServiceWorkerUpdate.ts (vía 'virtual:pwa-register/react'),
      // no automáticamente al cargar — así la UI de "nueva versión
      // disponible" tiene control total sobre cuándo se activa.
      injectRegister: false,
      manifest: {
        name: 'Chuleta C1',
        short_name: 'Chuleta C1',
        lang: 'es',
        description:
          'Estudia el temario y ponte a prueba con tests estilo oposición para el Cuerpo General Administrativo del Estado (C1).',
        // Relativos a la ubicación del propio manifest (servido junto al
        // resto del build) — así funcionan igual bajo "/" (dev, y la
        // futura build de Capacitor) y bajo "/chuleta-c1/" (GitHub
        // Pages), sin necesitar conocer `base` aquí.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#faf7f0',
        theme_color: '#1c2b4a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precachea el shell (JS/CSS/HTML generados por el build) y el
        // contenido académico embebido (JSON de temario/tests/flashcards,
        // que Vite empaqueta como parte de los chunks JS — ver
        // src/data/index.ts) e iconos. NO hay ninguna llamada de red en
        // tiempo de ejecución que precachear (ver Fase 4, punto 3: cero
        // CDNs en runtime), así que no se define ningún `runtimeCaching`
        // — no hay nada externo que cachear ni que excluir a propósito
        // (GitHub API, analítica, etc. nunca se llaman desde esta app).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        // Fallback de navegación SPA: cualquier ruta de la app
        // (/study/I-T01, /quiz/run, ...) que el navegador pida
        // directamente mientras está offline se sirve desde el
        // index.html precacheado — ver Fase 4, punto 5 y
        // docs/PWA_ARCHITECTURE.md, sección "Rutas offline". Se deja el
        // valor por defecto del plugin ("index.html", resuelto
        // internamente contra `base` — comprobado en el build de
        // producción que el manifiesto de precache y el SW quedan bajo
        // "/chuleta-c1/", igual que el resto del bundle) en vez de
        // fijarlo a mano, para no arriesgar un doble prefijo.
        // Sin ancla de inicio ("^/404\.html$") a propósito: bajo GitHub
        // Pages la app vive en "/chuleta-c1/404.html", no en "/404.html".
        // En la práctica esta entrada nunca compite de verdad con el
        // fallback: 404.html tiene su propia ruta de precache exacta
        // (registrada antes que el NavigationRoute), así que una
        // navegación directa a esa URL ya la sirve esa ruta específica.
        // Se deja como cinturón de seguridad explícito, no como el
        // mecanismo real de exclusión.
        navigateFallbackDenylist: [/\/404\.html$/],
      },
      // No se activa el SW durante `npm run dev` — solo tiene sentido
      // sobre un build de producción real (`vite build` + `vite preview`,
      // ver Fase 4, punto 12: aceptación manual offline). Mantiene el
      // ciclo de desarrollo normal sin un SW interceptando peticiones.
      devOptions: { enabled: false },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        // 404.html es una entrada real de Vite (no un fichero estático
        // pasado tal cual) para que su <script type="module"> reciba el
        // mismo tratamiento de base/hashing que index.html — ver
        // src/deploy/404-entry.ts.
        notFound: fileURLToPath(new URL('./404.html', import.meta.url)),
      },
    },
  },
  test: {
    // Ámbito explícito a src/: tests/*.test.mjs son los tests de Node
    // (node:test) del pipeline de contenido — Vitest no debe tocarlos.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    css: true,
  },
}));
