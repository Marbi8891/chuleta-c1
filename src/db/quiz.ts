// src/db/quiz.ts — persistencia y lectura de tests completados (tablas
// quizSessions + quizAnswers). Sustituye a pushQuizHistory() (legacy,
// appState.ts): en vez de un array recortado a 20 entradas {date,total,pct}
// en localStorage, cada test completado queda como una sesión con sus
// respuestas individuales, referenciando preguntas por QuestionId.

import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import type { QuizAnswerRecord, QuizSessionRecord } from './schema';
import type { TemaId } from '../types/content';

export interface RecordQuizSessionInput {
  id: string;
  startedAt: string;
  completedAt: string;
  scope: readonly TemaId[];
  answers: readonly Omit<QuizAnswerRecord, 'id' | 'sessionId'>[];
}

export interface QuizSessionDetail {
  session: QuizSessionRecord;
  answers: QuizAnswerRecord[];
}

/**
 * Persiste una sesión de test completada junto con sus respuestas, en una
 * única transacción Dexie (todo o nada).
 *
 * IDEMPOTENTE por `id` de sesión: antes de reinsertar las respuestas se
 * eliminan las existentes para ese sessionId dentro de la misma transacción.
 */
export async function recordQuizSession(
  input: RecordQuizSessionInput,
  database: ChuletaC1DB = defaultDb,
): Promise<void> {
  const total = input.answers.length;
  const correct = input.answers.filter((a) => a.correct).length;
  const session: QuizSessionRecord = {
    id: input.id,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    scope: [...input.scope],
    totalQuestions: total,
    correctAnswers: correct,
    incorrectAnswers: total - correct,
    blankAnswers: 0,
    completed: true,
  };

  await database.transaction('rw', database.quizSessions, database.quizAnswers, async () => {
    await database.quizSessions.put(session);
    await database.quizAnswers.where('sessionId').equals(input.id).delete();
    await database.quizAnswers.bulkAdd(input.answers.map((a) => ({ ...a, sessionId: input.id })));
  });
}

/** Tests completados, del más reciente al más antiguo. */
export async function listQuizSessions(database: ChuletaC1DB = defaultDb): Promise<QuizSessionRecord[]> {
  const sessions = await database.quizSessions.toArray();
  return sessions
    .filter((session) => session.completed)
    .sort((a, b) => {
      const aDate = a.completedAt ?? a.startedAt;
      const bDate = b.completedAt ?? b.startedAt;
      return bDate.localeCompare(aDate);
    });
}

/** Recupera una sesión y sus respuestas persistidas, en el orden en que se guardaron. */
export async function getQuizSessionDetail(
  sessionId: string,
  database: ChuletaC1DB = defaultDb,
): Promise<QuizSessionDetail | null> {
  const session = await database.quizSessions.get(sessionId);
  if (!session) return null;

  const answers = await database.quizAnswers.where('sessionId').equals(sessionId).toArray();
  answers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  return { session, answers };
}
