// src/db/quiz.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { recordQuizSession } from './quiz';

let testDb: ChuletaC1DB;

beforeEach(() => {
  testDb = createDb(`test-quiz-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

describe('recordQuizSession', () => {
  it('persiste la sesión y sus respuestas, referenciando preguntas por QuestionId (no por índice)', async () => {
    await recordQuizSession(
      {
        id: 'session-1',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:05:00.000Z',
        scope: ['I-T01', 'I-T02'],
        answers: [
          { questionId: 'I-T01-Q001', selectedAnswer: 'a', correct: true, answeredAt: '2026-01-01T00:01:00.000Z' },
          { questionId: 'I-T01-Q002', selectedAnswer: 'b', correct: false, answeredAt: '2026-01-01T00:02:00.000Z' },
        ],
      },
      testDb,
    );

    const session = await testDb.quizSessions.get('session-1');
    expect(session).toMatchObject({
      id: 'session-1',
      scope: ['I-T01', 'I-T02'],
      totalQuestions: 2,
      correctAnswers: 1,
      incorrectAnswers: 1,
      blankAnswers: 0,
      completed: true,
    });

    const answers = await testDb.quizAnswers.where('sessionId').equals('session-1').toArray();
    expect(answers).toHaveLength(2);
    expect(answers.map((a) => a.questionId).sort()).toEqual(['I-T01-Q001', 'I-T01-Q002']);
    expect(answers.every((a) => 'stem' in a === false)).toBe(true); // nunca duplica contenido académico
  });

  it('dos sesiones distintas no mezclan sus respuestas (índice sessionId)', async () => {
    const baseAnswer = { selectedAnswer: 'a' as const, correct: true, answeredAt: '2026-01-01T00:00:00.000Z' };
    await recordQuizSession(
      { id: 's1', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z', scope: [], answers: [{ ...baseAnswer, questionId: 'I-T01-Q001' }] },
      testDb,
    );
    await recordQuizSession(
      { id: 's2', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z', scope: [], answers: [{ ...baseAnswer, questionId: 'I-T02-Q001' }] },
      testDb,
    );

    expect(await testDb.quizAnswers.where('sessionId').equals('s1').count()).toBe(1);
    expect(await testDb.quizAnswers.where('sessionId').equals('s2').count()).toBe(1);
  });
});
