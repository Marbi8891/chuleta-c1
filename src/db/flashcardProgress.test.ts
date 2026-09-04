// src/db/flashcardProgress.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { getKnownFlashcardIds, resetFlashcardsKnown, setFlashcardKnown } from './flashcardProgress';

let testDb: ChuletaC1DB;

beforeEach(() => {
  testDb = createDb(`test-flashcard-progress-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

describe('flashcardProgress', () => {
  it('setFlashcardKnown(true) hace que la tarjeta aparezca en getKnownFlashcardIds', async () => {
    await setFlashcardKnown('c1', true, testDb);
    const known = await getKnownFlashcardIds(testDb);
    expect(known.has('c1')).toBe(true);
  });

  it('setFlashcardKnown(false) ("A repasar") no la deja marcada como dominada', async () => {
    await setFlashcardKnown('c1', true, testDb);
    await setFlashcardKnown('c1', false, testDb);
    const known = await getKnownFlashcardIds(testDb);
    expect(known.has('c1')).toBe(false);
  });

  it('resetFlashcardsKnown elimina la fila por completo (no la deja en known=false)', async () => {
    await setFlashcardKnown('c1', true, testDb);
    await resetFlashcardsKnown(['c1'], testDb);
    expect(await testDb.flashcardProgress.get('c1')).toBeUndefined();
  });

  it('getKnownFlashcardIds siempre lee el estado actual (sin caché) tras un reset', async () => {
    await setFlashcardKnown('c1', true, testDb);
    await setFlashcardKnown('c2', true, testDb);
    expect((await getKnownFlashcardIds(testDb)).size).toBe(2);

    await resetFlashcardsKnown(['c1'], testDb);
    const knownAfterReset = await getKnownFlashcardIds(testDb);
    expect(knownAfterReset.has('c1')).toBe(false);
    expect(knownAfterReset.has('c2')).toBe(true);
  });

  it('resetFlashcardsKnown con lista vacía no hace ninguna escritura', async () => {
    await setFlashcardKnown('c1', true, testDb);
    await resetFlashcardsKnown([], testDb);
    expect((await getKnownFlashcardIds(testDb)).has('c1')).toBe(true);
  });
});
