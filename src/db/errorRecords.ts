// src/db/errorRecords.ts — Study Intelligence, Fase 2 (CUADERNO DE ERRORES).
//
// Servicio de la tabla `errorRecords` (ver src/db/schema.ts para la forma
// de los datos y la máquina de estados). Nunca copia contenido académico:
// solo agrega/actualiza metadatos de seguimiento por QuestionId, resuelto
// siempre contra el banco canónico en la capa de UI (getQuestionById, en
// src/data/index.ts) — este módulo ni siquiera importa src/data/index.

import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import type { ErrorRecord, ErrorStatus } from './schema';
import type { QuestionId } from '../data/ids';
import type { TemaId } from '../types/content';

/**
 * Nº de aciertos consecutivos desde el último fallo a partir del cual una
 * pregunta se considera dominada. Valor único y centralizado: cualquier
 * ajuste futuro (p. ej. tras medir cuántos usuarios reinciden justo
 * después del umbral actual) se hace aquí, no repartido en cada llamante.
 */
export const ERROR_MASTERY_THRESHOLD = 3;

export interface QuizAnswerForErrorNotebook {
  questionId: QuestionId;
  /**
   * Derivación best-effort del prefijo de QuestionId (`<topicId>-Q<NNN>`),
   * no una resolución contra el banco canónico — ver el mismo patrón ya
   * usado como fallback de visualización en MorePage.tsx
   * (`answer.questionId.split('-Q')[0]`) y la nota de ids.impl.mjs sobre
   * por qué no existe un parseQuestionId() formal todavía. Es seguro
   * porque ningún TemaId contiene la subcadena "-Q" (formato fijo
   * `<BloqueId>-T<NN>`, ver types/content.ts) y porque este campo solo se
   * usa para filtrar el cuaderno por tema, nunca para validar identidad.
   */
  topicId: TemaId;
  correct: boolean;
  answeredAt: string;
}

function statusFor(correctCountAfterFailure: number): ErrorStatus {
  if (correctCountAfterFailure >= ERROR_MASTERY_THRESHOLD) return 'MASTERED';
  if (correctCountAfterFailure >= 1) return 'REVIEWING';
  return 'LEARNING';
}

function masteryScoreFor(correctCountAfterFailure: number): number {
  return Math.min(correctCountAfterFailure / ERROR_MASTERY_THRESHOLD, 1);
}

async function applyAnswer(database: ChuletaC1DB, answer: QuizAnswerForErrorNotebook): Promise<void> {
  const existing = await database.errorRecords.get(answer.questionId);

  if (!answer.correct) {
    if (!existing) {
      // Primer fallo de esta pregunta: entra al cuaderno como NEW.
      const record: ErrorRecord = {
        questionId: answer.questionId,
        topicId: answer.topicId,
        firstFailedAt: answer.answeredAt,
        lastFailedAt: answer.answeredAt,
        failureCount: 1,
        correctCountAfterFailure: 0,
        status: 'NEW',
        masteryScore: 0,
      };
      await database.errorRecords.put(record);
      return;
    }
    // Fallo repetido — incluida una REGRESIÓN real (una pregunta que ya se
    // consideraba REVIEWING/MASTERED y se vuelve a fallar): el contador de
    // aciertos encadenados se reinicia a cero, porque ya no hay una racha
    // de aciertos vigente desde el fallo más reciente.
    const record: ErrorRecord = {
      ...existing,
      lastFailedAt: answer.answeredAt,
      failureCount: existing.failureCount + 1,
      correctCountAfterFailure: 0,
      status: 'LEARNING',
      masteryScore: 0,
    };
    await database.errorRecords.put(record);
    return;
  }

  // Acierto: una pregunta que NUNCA se ha fallado no entra al cuaderno solo
  // por acertarla — `errorRecords` es "preguntas que en algún momento
  // costaron", no un historial general de aciertos (eso ya lo cubren
  // QUESTION_CORRECT/QUESTION_ANSWERED en studyEvents).
  if (!existing) return;

  const correctCountAfterFailure = existing.correctCountAfterFailure + 1;
  const record: ErrorRecord = {
    ...existing,
    correctCountAfterFailure,
    lastReviewedAt: answer.answeredAt,
    status: statusFor(correctCountAfterFailure),
    masteryScore: masteryScoreFor(correctCountAfterFailure),
  };
  await database.errorRecords.put(record);
}

/**
 * Aplica todas las respuestas de una sesión de test terminada al cuaderno
 * de errores. IDEMPOTENTE por sessionId (ver ErrorNotebookProcessedSessionRecord
 * en schema.ts): si esta sesión ya se procesó, no hace nada — necesario
 * porque SAFE QUIZ COMPLETION (Fase 3B) puede obligar a reintentar el
 * guardado de una sesión con exactamente las mismas respuestas.
 *
 * Transaccional en su propia tabla: o se marca la sesión como procesada Y
 * se aplican todas sus respuestas, o ninguna de las dos cosas — nunca un
 * estado a medias donde la sesión quede "procesada" sin haber actualizado
 * todos sus errores (o viceversa).
 */
export async function processQuizAnswersForErrorNotebook(
  sessionId: string,
  answers: readonly QuizAnswerForErrorNotebook[],
  database: ChuletaC1DB = defaultDb,
): Promise<void> {
  await database.transaction(
    'rw',
    database.errorRecords,
    database.errorNotebookProcessedSessions,
    async () => {
      const alreadyProcessed = await database.errorNotebookProcessedSessions.get(sessionId);
      if (alreadyProcessed) return;

      for (const answer of answers) {
        await applyAnswer(database, answer);
      }

      await database.errorNotebookProcessedSessions.put({ sessionId, processedAt: new Date().toISOString() });
    },
  );
}

export interface QueryErrorRecordsOptions {
  status?: ErrorStatus;
  topicId?: TemaId;
}

/**
 * Lee el cuaderno de errores. Sin filtros, devuelve TODOS los registros
 * (incluidos los MASTERED — decidir qué pestaña mostrar por defecto es
 * responsabilidad de la UI, no de esta consulta), ordenados por fallo más
 * reciente primero (lo más urgente de repasar, arriba).
 */
export async function queryErrorRecords(
  options: QueryErrorRecordsOptions = {},
  database: ChuletaC1DB = defaultDb,
): Promise<ErrorRecord[]> {
  let rows: ErrorRecord[];
  if (options.status) {
    rows = await database.errorRecords.where('status').equals(options.status).toArray();
  } else if (options.topicId) {
    rows = await database.errorRecords.where('topicId').equals(options.topicId).toArray();
  } else {
    rows = await database.errorRecords.toArray();
  }
  if (options.status && options.topicId) {
    rows = rows.filter((row) => row.topicId === options.topicId);
  }
  return rows.sort((a, b) => b.lastFailedAt.localeCompare(a.lastFailedAt));
}
