// src/db/topicProgress.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { getStudyFsIndex, markTopicStudied, setStudyFsIndex } from './topicProgress';

let testDb: ChuletaC1DB;

beforeEach(() => {
  testDb = createDb(`test-topic-progress-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

describe('topicProgress', () => {
  it('markTopicStudied marca el tema como leído', async () => {
    await markTopicStudied('I-T01', testDb);
    const row = await testDb.topicProgress.get('I-T01');
    expect(row?.studied).toBe(true);
  });

  it('markTopicStudied es idempotente (no reescribe updatedAt si ya estaba marcado)', async () => {
    await markTopicStudied('I-T01', testDb);
    const first = await testDb.topicProgress.get('I-T01');
    await new Promise((r) => setTimeout(r, 5));
    await markTopicStudied('I-T01', testDb);
    const second = await testDb.topicProgress.get('I-T01');
    expect(second?.updatedAt).toBe(first?.updatedAt);
  });

  it('Study Intelligence Fase 1: cada llamada registra TOPIC_OPENED, incluso si el tema ya estaba marcado como leído', async () => {
    await markTopicStudied('I-T01', testDb);
    await markTopicStudied('I-T01', testDb); // ya estaba marcado: topicProgress no cambia, pero es una apertura real
    const events = await testDb.studyEvents.where('type').equals('TOPIC_OPENED').toArray();
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.topicId === 'I-T01')).toBe(true);
  });

  it('un fallo al registrar TOPIC_OPENED no impide marcar el progreso real (principio de no interferencia)', async () => {
    vi.spyOn(testDb.studyEvents, 'add').mockRejectedValueOnce(new Error('fallo simulado de studyEvents'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(markTopicStudied('I-T01', testDb)).resolves.toBeUndefined();

    const row = await testDb.topicProgress.get('I-T01');
    expect(row?.studied).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recordStudyEvent:TOPIC_OPENED'), expect.any(Error));

    errorSpy.mockRestore();
  });

  it('getStudyFsIndex por defecto devuelve el índice por defecto (18px)', async () => {
    expect(await getStudyFsIndex(testDb)).toBe(1);
  });

  it('setStudyFsIndex recorta al rango válido (0..4) y es una preferencia global, no por tema', async () => {
    await setStudyFsIndex(99, testDb);
    expect(await getStudyFsIndex(testDb)).toBe(4);
    await setStudyFsIndex(-5, testDb);
    expect(await getStudyFsIndex(testDb)).toBe(0);
  });
});
