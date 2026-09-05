// src/db/studyEvents.test.ts — Study Intelligence, Fase 1.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { queryStudyEvents, recordStudyEvent, recordStudyEvents } from './studyEvents';

let testDb: ChuletaC1DB;

beforeEach(() => {
  testDb = createDb(`test-study-events-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

describe('recordStudyEvent', () => {
  it('persiste un evento con timestamp explícito y solo los campos de referencia dados', async () => {
    await recordStudyEvent({ type: 'TOPIC_OPENED', topicId: 'I-T01', timestamp: '2026-01-01T00:00:00.000Z' }, testDb);
    const rows = await testDb.studyEvents.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'TOPIC_OPENED', topicId: 'I-T01', timestamp: '2026-01-01T00:00:00.000Z' });
    expect(rows[0]).not.toHaveProperty('questionId');
    expect(rows[0]).not.toHaveProperty('flashcardId');
  });

  it('usa "ahora" como timestamp por defecto si no se pasa uno explícito', async () => {
    const before = new Date().toISOString();
    await recordStudyEvent({ type: 'QUESTION_STARRED', questionId: 'I-T01-Q001' }, testDb);
    const after = new Date().toISOString();

    const [row] = await testDb.studyEvents.toArray();
    expect(row?.timestamp).toBeDefined();
    expect(row!.timestamp >= before).toBe(true);
    expect(row!.timestamp <= after).toBe(true);
  });
});

describe('recordStudyEvents (bulk)', () => {
  it('persiste varios eventos de una vez', async () => {
    await recordStudyEvents(
      [
        { type: 'QUIZ_COMPLETED', quizSessionId: 's1', timestamp: '2026-01-01T00:05:00.000Z' },
        { type: 'QUESTION_CORRECT', questionId: 'I-T01-Q001', quizSessionId: 's1', timestamp: '2026-01-01T00:01:00.000Z' },
      ],
      testDb,
    );
    expect(await testDb.studyEvents.count()).toBe(2);
  });

  it('con una lista vacía no hace ninguna escritura', async () => {
    await recordStudyEvents([], testDb);
    expect(await testDb.studyEvents.count()).toBe(0);
  });
});

describe('queryStudyEvents', () => {
  beforeEach(async () => {
    await recordStudyEvents(
      [
        { type: 'TOPIC_OPENED', topicId: 'I-T01', timestamp: '2026-01-01T09:00:00.000Z' },
        { type: 'TOPIC_OPENED', topicId: 'I-T02', timestamp: '2026-01-02T09:00:00.000Z' },
        { type: 'QUESTION_CORRECT', questionId: 'I-T01-Q001', topicId: 'I-T01', timestamp: '2026-01-03T09:00:00.000Z' },
        { type: 'QUESTION_INCORRECT', questionId: 'I-T01-Q002', topicId: 'I-T01', timestamp: '2026-01-04T09:00:00.000Z' },
      ],
      testDb,
    );
  });

  it('filtra por tipo usando el índice `type`', async () => {
    const rows = await queryStudyEvents({ type: 'TOPIC_OPENED' }, testDb);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.type === 'TOPIC_OPENED')).toBe(true);
  });

  it('filtra por topicId usando el índice `topicId`', async () => {
    const rows = await queryStudyEvents({ topicId: 'I-T01' }, testDb);
    expect(rows.map((r) => r.type).sort()).toEqual(['QUESTION_CORRECT', 'QUESTION_INCORRECT', 'TOPIC_OPENED'].sort());
  });

  it('filtra por rango de fecha (since/until) usando el índice `timestamp`', async () => {
    const rows = await queryStudyEvents({ since: '2026-01-02T00:00:00.000Z', until: '2026-01-03T23:59:59.999Z' }, testDb);
    expect(rows.map((r) => r.timestamp).sort()).toEqual(['2026-01-02T09:00:00.000Z', '2026-01-03T09:00:00.000Z']);
    expect(rows.map((r) => r.type).sort()).toEqual(['QUESTION_CORRECT', 'TOPIC_OPENED']);
  });

  it('combina filtros (type + topicId) aunque solo uno de ellos use el índice de Dexie', async () => {
    const rows = await queryStudyEvents({ type: 'QUESTION_INCORRECT', topicId: 'I-T01' }, testDb);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.questionId).toBe('I-T01-Q002');
  });

  it('ordena de más reciente a más antiguo y respeta `limit`', async () => {
    const rows = await queryStudyEvents({}, testDb);
    expect(rows.map((r) => r.timestamp)).toEqual([
      '2026-01-04T09:00:00.000Z',
      '2026-01-03T09:00:00.000Z',
      '2026-01-02T09:00:00.000Z',
      '2026-01-01T09:00:00.000Z',
    ]);

    const limited = await queryStudyEvents({ limit: 2 }, testDb);
    expect(limited).toHaveLength(2);
    expect(limited[0]?.timestamp).toBe('2026-01-04T09:00:00.000Z');
  });

  it('sin ningún filtro devuelve todos los eventos', async () => {
    const rows = await queryStudyEvents({}, testDb);
    expect(rows).toHaveLength(4);
  });
});
