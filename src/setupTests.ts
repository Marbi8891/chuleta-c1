// src/setupTests.ts — cargado por Vitest (ver vite.config.ts, test.setupFiles).

// jsdom no implementa IndexedDB (Fase 3, Dexie): fake-indexeddb la sustituye
// por una implementación en memoria. Debe importarse ANTES que cualquier
// módulo que construya una instancia Dexie (src/db/db.ts se importa desde
// muchos tests), así que va lo primero de todo el fichero.
import 'fake-indexeddb/auto';

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { db } from './db/db';

// jsdom no implementa window.scrollTo; la app lo llama al navegar entre
// artículos de Estudiar (ver StudyArticlePage.tsx), así que se sustituye por
// un no-op para no ensuciar la salida de los tests con un error irrelevante.
window.scrollTo = () => {};

// La instancia Dexie por defecto (src/db/db.ts) es un módulo singleton:
// persiste entre los `it()` de un mismo fichero de test (igual que el
// store de src/state/appState.ts — ver el comentario de Fase 2B en
// Flashcards.test.tsx). Se limpia después de cada test para que ningún
// test dependa, sin darse cuenta, de progreso escrito por el anterior.
afterEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  try {
    localStorage.clear();
  } catch {
    // no-op: algunos tests pueden simular un localStorage que lanza.
  }
});
