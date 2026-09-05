// src/db/quiz.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { getQuizSessionDetail, listQuizSessions, recordQuizSession } from './quiz';

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
    expect(answers.every((a) => 'stem' in a === false)).toBe(true);
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

  it('IDEMPOTENTE: llamarla dos veces con el mismo sessionId no duplica quizAnswers', async () => {
    const input = {
      id: 'retry-session',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:05:00.000Z',
      scope: ['I-T01'] as const,
      answers: [
        { questionId: 'I-T01-Q001', selectedAnswer: 'a' as const, correct: true, answeredAt: '2026-01-01T00:01:00.000Z' },
        { questionId: 'I-T01-Q002', selectedAnswer: 'b' as const, correct: false, answeredAt: '2026-01-01T00:02:00.000Z' },
        { questionId: 'I-T01-Q003', selectedAnswer: 'c' as const, correct: true, answeredAt: '2026-01-01T00:03:00.000Z' },
      ],
    };

    await recordQuizSession(input, testDb);
    await recordQuizSession(input, testDb);

    expect(await testDb.quizSessions.count()).toBe(1);
    const answers = await testDb.quizAnswers.where('sessionId').equals('retry-session').toArray();
    expect(answers).toHaveLength(3);
    expect(answers.map((a) => a.questionId).sort()).toEqual(['I-T01-Q001', 'I-T01-Q002', 'I-T01-Q003']);
  });
});

describe('Study Intelligence Fase 1: eventos de actividad emitidos al completar un test', () => {
  it('registra QUIZ_COMPLETED y un QUESTION_ANSWERED/QUESTION_CORRECT o QUESTION_INCORRECT por cada respuesta, con el answeredAt real', async () => {
    await recordQuizSession(
      {
        id: 'events-session',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:05:00.000Z',
        scope: ['I-T01'],
        answers: [
          { questionId: 'I-T01-Q001', selectedAnswer: 'a', correct: true, answeredAt: '2026-01-01T00:01:00.000Z' },
          { questionId: 'I-T01-Q002', selectedAnswer: 'b', correct: false, answeredAt: '2026-01-01T00:02:00.000Z' },
        ],
      },
      testDb,
    );

    const events = await testDb.studyEvents.where('quizSessionId').equals('events-session').toArray();
    const completed = events.filter((e) => e.type === 'QUIZ_COMPLETED');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.timestamp).toBe('2026-01-01T00:05:00.000Z');

    const answered = events.filter((e) => e.type === 'QUESTION_ANSWERED');
    expect(answered.map((e) => e.questionId).sort()).toEqual(['I-T01-Q001', 'I-T01-Q002']);

    const correct = events.find((e) => e.type === 'QUESTION_CORRECT');
    expect(correct?.questionId).toBe('I-T01-Q001');
    expect(correct?.timestamp).toBe('2026-01-01T00:01:00.000Z');

    const incorrect = events.find((e) => e.type === 'QUESTION_INCORRECT');
    expect(incorrect?.questionId).toBe('I-T01-Q002');
  });

  it('un fallo al registrar los eventos NO impide que la sesión y las respuestas se guarden (principio de no interferencia)', async () => {
    vi.spyOn(testDb.studyEvents, 'bulkAdd').mockRejectedValueOnce(new Error('fallo simulado de studyEvents'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      recordQuizSession(
        {
          id: 'events-fail-session',
          startedAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:05:00.000Z',
          scope: ['I-T01'],
          answers: [{ questionId: 'I-T01-Q001', selectedAnswer: 'a', correct: true, answeredAt: '2026-01-01T00:01:00.000Z' }],
        },
        testDb,
      ),
    ).resolves.toBeUndefined();

    const session = await testDb.quizSessions.get('events-fail-session');
    expect(session?.completed).toBe(true);
    const answers = await testDb.quizAnswers.where('sessionId').equals('events-fail-session').toArray();
    expect(answers).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('recordStudyEvent:QUIZ_COMPLETED'), expect.any(Error));

    errorSpy.mockRestore();
  });
});

describe('historial de tests', () => {
  it('lista solo sesiones completadas de más reciente a más antigua', async () => {
    await testDb.quizSessions.bulkPut([
      {
        id: 'old',
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:05:00.000Z',
        totalQuestions: 10,
        correctAnswers: 7,
        incorrectAnswers: 3,
        blankAnswers: 0,
        completed: true,
      },
      {
        id: 'new',
        startedAt: '2026-01-02T10:00:00.000Z',
        completedAt: '2026-01-02T10:05:00.000Z',
        totalQuestions: 10,
        correctAnswers: 8,
        incorrectAnswers: 2,
        blankAnswers: 0,
        completed: true,
      },
      {
        id: 'incomplete',
        startedAt: '2026-01-03T10:00:00.000Z',
        totalQuestions: 10,
        blankAnswers: 0,
        completed: false,
      },
    ]);

    const sessions = await listQuizSessions(testDb);
    expect(sessions.map((session) => session.id)).toEqual(['new', 'old']);
  });

  it('recupera una sesión con sus respuestas y devuelve null si no existe', async () => {
    await recordQuizSession(
      {
        id: 'detail-session',
        startedAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-01T00:05:00.000Z',
        scope: ['I-T01'],
        answers: [
          { questionId: 'I-T01-Q001', selectedAnswer: 'a', correct: true, answeredAt: '2026-01-01T00:01:00.000Z' },
          { questionId: 'I-T01-Q002', selectedAnswer: 'b', correct: false, answeredAt: '2026-01-01T00:02:00.000Z' },
        ],
      },
      testDb,
    );

    const detail = await getQuizSessionDetail('detail-session', testDb);
    expect(detail?.session.id).toBe('detail-session');
    expect(detail?.answers.map((answer) => answer.questionId)).toEqual(['I-T01-Q001', 'I-T01-Q002']);
    expect(await getQuizSessionDetail('missing', testDb)).toBeNull();
  });
});
