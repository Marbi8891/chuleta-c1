// src/db/quiz.ts — persistencia y lectura de tests completados (tablas
// quizSessions + quizAnswers). Sustituye a pushQuizHistory() (legacy,
// appState.ts): en vez de un array recortado a 20 entradas {date,total,pct}
// en localStorage, cada test completado queda como una sesión con sus
// respuestas individuales, referenciando preguntas por QuestionId.

import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import type { QuizAnswerRecord, QuizSessionRecord } from './schema';
import type { RecordStudyEventInput } from './studyEvents';
import { recordStudyEvents } from './studyEvents';
import type { QuizAnswerForErrorNotebook } from './errorRecords';
import { processQuizAnswersForErrorNotebook } from './errorRecords';
import { reportWriteError } from './reportWriteError';
import type { TemaId } from '../types/content';

/**
 * Deriva el topicId a partir del prefijo de un QuestionId
 * (`<topicId>-Q<NNN>`) — mismo patrón ya usado como fallback de
 * visualización en MorePage.tsx (`questionId.split('-Q')[0]`), no un
 * parser formal (ver la nota correspondiente en src/data/ids.impl.mjs).
 * Solo se usa para poder filtrar el Cuaderno de errores por tema; nunca
 * para validar ni reconstruir la identidad de la pregunta.
 */
function topicIdFromQuestionId(questionId: string): TemaId {
  return questionId.split('-Q')[0] ?? questionId;
}

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

  // Study Intelligence, Fase 1: eventos de actividad DESPUÉS de que la
  // transacción anterior (la fuente de verdad del resultado del test) haya
  // tenido éxito, y en su propio try/catch — un fallo aquí nunca debe hacer
  // pensar a QuizContext que el test no se guardó (ver
  // docs/STUDY_INTELLIGENCE_ARCHITECTURE.md, sección 2.2). Cada evento usa
  // el `answeredAt` real de su respuesta, no "ahora", para que la serie
  // temporal sea fiel a cuándo ocurrió cada cosa de verdad, no a cuándo
  // Dexie tuvo ocasión de persistirla.
  try {
    const events: RecordStudyEventInput[] = [
      { type: 'QUIZ_COMPLETED', quizSessionId: input.id, timestamp: input.completedAt },
    ];
    for (const answer of input.answers) {
      events.push({
        type: 'QUESTION_ANSWERED',
        questionId: answer.questionId,
        quizSessionId: input.id,
        timestamp: answer.answeredAt,
      });
      events.push({
        type: answer.correct ? 'QUESTION_CORRECT' : 'QUESTION_INCORRECT',
        questionId: answer.questionId,
        quizSessionId: input.id,
        timestamp: answer.answeredAt,
      });
    }
    await recordStudyEvents(events, database);
  } catch (e) {
    reportWriteError('recordStudyEvent:QUIZ_COMPLETED', e);
  }

  // Study Intelligence, Fase 2 (CUADERNO DE ERRORES): igual que los
  // eventos de actividad arriba, esto se deriva del resultado del test
  // pero NUNCA es la fuente de verdad de ese resultado — un fallo aquí no
  // debe poder hacer pensar a QuizContext que el test no se guardó. Va
  // DESPUÉS de la transacción principal y en su propio try/catch. A
  // diferencia de los eventos (donde una entrada duplicada en un reintento
  // es solo ruido), aquí sí importa la idempotencia real por sessionId —
  // la aplica processQuizAnswersForErrorNotebook, no esta función.
  try {
    const answersForNotebook: QuizAnswerForErrorNotebook[] = input.answers.map((answer) => ({
      questionId: answer.questionId,
      topicId: topicIdFromQuestionId(answer.questionId),
      correct: answer.correct,
      answeredAt: answer.answeredAt,
    }));
    await processQuizAnswersForErrorNotebook(input.id, answersForNotebook, database);
  } catch (e) {
    reportWriteError('processQuizAnswersForErrorNotebook', e);
  }
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
