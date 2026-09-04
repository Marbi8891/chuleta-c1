// src/setupTests.ts — cargado por Vitest (ver vite.config.ts, test.setupFiles).
import '@testing-library/jest-dom/vitest';

// jsdom no implementa window.scrollTo; la app lo llama al navegar entre
// artículos de Estudiar (ver StudyArticlePage.tsx), así que se sustituye por
// un no-op para no ensuciar la salida de los tests con un error irrelevante.
window.scrollTo = () => {};
