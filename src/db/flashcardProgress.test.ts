// src/db/flashcardProgress.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('Study Intelligence Fase 1: setFlashcardKnown registra FLASHCARD_REVIEWED + FLASHCARD_KNOWN/FLASHCARD_FAILED según el resultado', async () => {
    await setFlashcardKnown('c1', true, testDb);
    await setFlashcardKnown('c1', false, testDb);

    const reviewed = await testDb.studyEvents.where('type').equals('FLASHCARD_REVIEWED').toArray();
    expect(reviewed).toHaveLength(2);
    expect(reviewed.every((e) => e.flashcardId === 'c1')).toBe(true);

    expect(await testDb.studyEvents.where('type').equals('FLASHCARD_KNOWN').count()).toBe(1);
    expect(await testDb.studyEvents.where('type').equals('FLASHCARD_FAILED').count()).toBe(1);
  });

  it('un fallo al registrar los eventos no impide guardar el progreso real de la flashcard (principio de no interferencia)', async () => {
    vi.spyOn(testDb.studyEvents, 'bulkAdd').mockRejectedValueOnce(new Error('fallo simulado de studyEvents'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(setFlashcardKnown('c1', true, testDb)).resolves.toBeUndefined();

    const known = await getKnownFlashcardIds(testDb);
    expect(known.has('c1')).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recordStudyEvent:FLASHCARD_REVIEWED'), expect.any(Error));

    errorSpy.mockRestore();
  });
});
