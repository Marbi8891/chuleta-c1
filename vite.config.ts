/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base del despliegue en GitHub Pages (proyecto Marbi8891/chuleta-c1 →
// https://marbi8891.github.io/chuleta-c1/). Solo se aplica al build de
// producción — `npm run dev` sigue sirviendo desde "/", que es más cómodo
// en local y es también lo que necesitará la futura build de Capacitor
// (que en su momento pasará su propio `base` relativo por CLI, sin tocar
// este fichero — ver docs/adr/0005-github-pages-deployment.md).
const GITHUB_PAGES_BASE = '/chuleta-c1/';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? GITHUB_PAGES_BASE : '/',
  plugins: [react()],
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
