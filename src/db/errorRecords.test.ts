// src/db/errorRecords.test.ts — Study Intelligence, Fase 2 (CUADERNO DE ERRORES).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import {
  ERROR_MASTERY_THRESHOLD,
  processQuizAnswersForErrorNotebook,
  queryErrorRecords,
  type QuizAnswerForErrorNotebook,
} from './errorRecords';

let testDb: ChuletaC1DB;

beforeEach(() => {
  testDb = createDb(`test-error-records-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

function answer(
  overrides: Partial<QuizAnswerForErrorNotebook> & Pick<QuizAnswerForErrorNotebook, 'questionId' | 'correct' | 'answeredAt'>,
): QuizAnswerForErrorNotebook {
  return { topicId: 'I-T01', ...overrides };
}

describe('processQuizAnswersForErrorNotebook', () => {
  it('un fallo nuevo crea un ErrorRecord en estado NEW', async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' })],
      testDb,
    );

    const record = await testDb.errorRecords.get('I-T01-Q001');
    expect(record).toMatchObject({
      questionId: 'I-T01-Q001',
      topicId: 'I-T01',
      firstFailedAt: '2026-01-01T00:00:00.000Z',
      lastFailedAt: '2026-01-01T00:00:00.000Z',
      failureCount: 1,
      correctCountAfterFailure: 0,
      status: 'NEW',
      masteryScore: 0,
    });
    expect(record).not.toHaveProperty('lastReviewedAt');
  });

  it('un acierto de una pregunta nunca fallada NO crea ningún ErrorRecord', async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [answer({ questionId: 'I-T01-Q001', correct: true, answeredAt: '2026-01-01T00:00:00.000Z' })],
      testDb,
    );
    expect(await testDb.errorRecords.count()).toBe(0);
  });

  it(`tras ${ERROR_MASTERY_THRESHOLD} aciertos consecutivos desde el último fallo, pasa a MASTERED`, async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' })],
      testDb,
    );

    for (let i = 1; i < ERROR_MASTERY_THRESHOLD; i++) {
      const day = String(i + 1).padStart(2, '0');
      await processQuizAnswersForErrorNotebook(
        `s${i + 1}`,
        [answer({ questionId: 'I-T01-Q001', correct: true, answeredAt: `2026-01-${day}T00:00:00.000Z` })],
        testDb,
      );
      const midway = await testDb.errorRecords.get('I-T01-Q001');
      expect(midway?.status).toBe('REVIEWING');
    }

    const lastDay = String(ERROR_MASTERY_THRESHOLD + 1).padStart(2, '0');
    await processQuizAnswersForErrorNotebook(
      `s${ERROR_MASTERY_THRESHOLD + 1}`,
      [answer({ questionId: 'I-T01-Q001', correct: true, answeredAt: `2026-01-${lastDay}T00:00:00.000Z` })],
      testDb,
    );

    const mastered = await testDb.errorRecords.get('I-T01-Q001');
    expect(mastered?.status).toBe('MASTERED');
    expect(mastered?.correctCountAfterFailure).toBe(ERROR_MASTERY_THRESHOLD);
    expect(mastered?.masteryScore).toBe(1);
  });

  it('REGRESIÓN: una pregunta MASTERED que se vuelve a fallar reinicia los aciertos encadenados y vuelve a LEARNING', async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' })],
      testDb,
    );
    for (let i = 0; i < ERROR_MASTERY_THRESHOLD; i++) {
      await processQuizAnswersForErrorNotebook(
        `s-ok-${i}`,
        [answer({ questionId: 'I-T01-Q001', correct: true, answeredAt: `2026-01-0${i + 2}T00:00:00.000Z` })],
        testDb,
      );
    }
    expect((await testDb.errorRecords.get('I-T01-Q001'))?.status).toBe('MASTERED');

    await processQuizAnswersForErrorNotebook(
      's-regresion',
      [answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-02-01T00:00:00.000Z' })],
      testDb,
    );

    const record = await testDb.errorRecords.get('I-T01-Q001');
    expect(record).toMatchObject({
      status: 'LEARNING',
      correctCountAfterFailure: 0,
      masteryScore: 0,
      failureCount: 2,
      lastFailedAt: '2026-02-01T00:00:00.000Z',
    });
    // firstFailedAt NO cambia con una regresión: sigue siendo el primer fallo histórico.
    expect(record?.firstFailedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('IDEMPOTENTE por sessionId: reprocesar la misma sesión no duplica failureCount ni correctCountAfterFailure', async () => {
    const answers = [
      answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' }),
      answer({ questionId: 'I-T01-Q002', correct: true, answeredAt: '2026-01-01T00:01:00.000Z' }),
    ];
    await processQuizAnswersForErrorNotebook('retry-session', answers, testDb);
    await processQuizAnswersForErrorNotebook('retry-session', answers, testDb);

    const record = await testDb.errorRecords.get('I-T01-Q001');
    expect(record?.failureCount).toBe(1);
    // I-T01-Q002 nunca se falló, así que ni siquiera entra al cuaderno.
    expect(await testDb.errorRecords.get('I-T01-Q002')).toBeUndefined();
  });

  it('varias preguntas de la misma sesión se procesan de forma independiente', async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [
        answer({ questionId: 'I-T01-Q001', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' }),
        answer({ questionId: 'I-T01-Q002', topicId: 'I-T02', correct: false, answeredAt: '2026-01-01T00:01:00.000Z' }),
      ],
      testDb,
    );
    expect(await testDb.errorRecords.count()).toBe(2);
    expect((await testDb.errorRecords.get('I-T01-Q002'))?.topicId).toBe('I-T02');
  });
});

describe('queryErrorRecords', () => {
  beforeEach(async () => {
    await processQuizAnswersForErrorNotebook(
      's1',
      [
        answer({ questionId: 'I-T01-Q001', topicId: 'I-T01', correct: false, answeredAt: '2026-01-01T00:00:00.000Z' }),
        answer({ questionId: 'I-T02-Q001', topicId: 'I-T02', correct: false, answeredAt: '2026-01-02T00:00:00.000Z' }),
      ],
      testDb,
    );
    // I-T02-Q001 pasa a REVIEWING (un acierto tras su fallo).
    await processQuizAnswersForErrorNotebook(
      's2',
      [answer({ questionId: 'I-T02-Q001', topicId: 'I-T02', correct: true, answeredAt: '2026-01-03T00:00:00.000Z' })],
      testDb,
    );
  });

  it('sin filtros devuelve todos los registros, más reciente primero', async () => {
    const rows = await queryErrorRecords({}, testDb);
    expect(rows.map((r) => r.questionId)).toEqual(['I-T02-Q001', 'I-T01-Q001']);
  });

  it('filtra por status', async () => {
    const rows = await queryErrorRecords({ status: 'NEW' }, testDb);
    expect(rows.map((r) => r.questionId)).toEqual(['I-T01-Q001']);
  });

  it('filtra por topicId', async () => {
    const rows = await queryErrorRecords({ topicId: 'I-T02' }, testDb);
    expect(rows.map((r) => r.questionId)).toEqual(['I-T02-Q001']);
  });

  it('combina status + topicId', async () => {
    expect(await queryErrorRecords({ status: 'REVIEWING', topicId: 'I-T01' }, testDb)).toEqual([]);
    expect((await queryErrorRecords({ status: 'REVIEWING', topicId: 'I-T02' }, testDb)).map((r) => r.questionId)).toEqual([
      'I-T02-Q001',
    ]);
  });
});
