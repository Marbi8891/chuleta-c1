// src/db/flashcardProgress.ts — progreso de Flashcards (tabla flashcardProgress).
//
// Fase 2B corrigió un bug de cierre obsoleto en FlashcardsPage.buildQueue
// (leía `known` a través de un snapshot de render memoizado). Con Dexie
// (API asíncrona) ese mismo patrón sería aún más frágil si dependiera de
// `useLiveQuery` dentro de una función memoizada: el efecto de una
// escritura no está garantizado visible antes del siguiente render. Para
// no reintroducir esa clase de bug, `getKnownFlashcardIds()` hace SIEMPRE
// una lectura fresca directa a Dexie (nunca una caché) — quien la llama
// justo después de `await resetFlashcardsKnown(...)` ve el estado real
// post-escritura, sin depender de temporización de reactividad.

import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';

/** Equivalente a `state.known[cardId] = known; saveState();` en paintFlash() (legacy). */
export async function setFlashcardKnown(flashcardId: string, known: boolean, database: ChuletaC1DB = defaultDb): Promise<void> {
  await database.flashcardProgress.put({ flashcardId, known, updatedAt: new Date().toISOString() });
}

/**
 * Equivalente al bucle `delete state.known[c.id]` de flashResetKnown()
 * (legacy): elimina la fila por completo (no la deja en known=false) —
 * mismo significado que "nunca marcada", más pequeño que dejar filas
 * known=false acumulándose sin motivo.
 */
export async function resetFlashcardsKnown(flashcardIds: readonly string[], database: ChuletaC1DB = defaultDb): Promise<void> {
  if (flashcardIds.length === 0) return;
  await database.flashcardProgress.bulkDelete(flashcardIds as string[]);
}

/**
 * Lectura fresca (nunca cacheada) del conjunto de flashcards marcadas
 * como dominadas. Dataset pequeño (≤165 filas): se trae la tabla entera
 * y se filtra en memoria — no se indexa `known` (booleano; IndexedDB ni
 * siquiera admite booleanos como clave de índice).
 */
export async function getKnownFlashcardIds(database: ChuletaC1DB = defaultDb): Promise<ReadonlySet<string>> {
  const rows = await database.flashcardProgress.toArray();
  const known = new Set<string>();
  for (const row of rows) if (row.known) known.add(row.flashcardId);
  return known;
}
