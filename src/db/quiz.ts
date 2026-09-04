// src/db/quiz.ts — persistencia de tests completados (tablas quizSessions +
// quizAnswers). Sustituye a pushQuizHistory() (legacy, appState.ts): en vez
// de un array recortado a 20 entradas {date,total,pct} en localStorage,
// cada test completado desde esta fase en adelante queda como una sesión
// con sus respuestas individuales, referenciando preguntas por QuestionId
// (nunca duplicando su contenido — ver QUESTION REFERENCES en la
// especificación de Fase 3 y docs/adr/0006).

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

/**
 * Persiste una sesión de test completada junto con sus respuestas, en una
 * única transacción Dexie (todo o nada — ver MIGRATION TRANSACTION /
 * DATABASE VERSIONING en la especificación: el mismo principio aplica a
 * cualquier escritura multi-tabla, no solo a la migración).
 */
export async function recordQuizSession(input: RecordQuizSessionInput, database: ChuletaC1DB = defaultDb): Promise<void> {
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
    // La UX actual no permite dejar una pregunta en blanco (hay que
    // responder para poder avanzar) — ver el comentario de
    // QuizSessionRecord en schema.ts.
    blankAnswers: 0,
    completed: true,
  };

  await database.transaction('rw', database.quizSessions, database.quizAnswers, async () => {
    await database.quizSessions.put(session);
    await database.quizAnswers.bulkAdd(input.answers.map((a) => ({ ...a, sessionId: input.id })));
  });
}
