// src/db/studyEvents.ts — Study Intelligence, Fase 1 (STUDY EVENT
// FOUNDATION). Registro y consulta de la tabla `studyEvents` (ver
// src/db/schema.ts para el razonamiento del modelo, y
// docs/STUDY_INTELLIGENCE_ARCHITECTURE.md sección 2.2 para el diseño
// completo).
//
// PRINCIPIO DE NO INTERFERENCIA: registrar un evento NUNCA debe poder
// hacer fallar la operación de progreso junto a la que se emite (guardar
// un test, marcar un tema, marcar una flashcard). Por eso este módulo no
// impone try/catch por sí mismo — lo deja a cada llamante, igual que ya
// hace `reportWriteError` para las escrituras fire-and-forget existentes
// (markTopicStudied/setFlashcardKnown) — así el propio código que emite
// decide con qué contexto reportar el fallo si lo hay. Ver
// src/db/topicProgress.ts, src/db/flashcardProgress.ts y src/db/quiz.ts
// para los tres puntos de emisión de esta fase.

import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import type { StudyEventRecord, StudyEventType } from './schema';
import type { TemaId } from '../types/content';
import type { QuestionId } from '../data/ids';

export interface RecordStudyEventInput {
  type: StudyEventType;
  topicId?: TemaId;
  questionId?: QuestionId;
  flashcardId?: string;
  quizSessionId?: string;
  mockExamId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
  /**
   * Instante REAL del evento. Por defecto "ahora" — pero algunos llamantes
   * (p. ej. recordQuizSession, que persiste todas las respuestas de golpe
   * al completar el test) ya conocen el instante exacto en que cada cosa
   * ocurrió de verdad (QuizAnswerRecord.answeredAt) y deben pasarlo
   * explícitamente, para que la serie temporal de eventos sea fiel a la
   * actividad real del usuario y no a cuándo Dexie tuvo ocasión de escribir.
   */
  timestamp?: string;
}

function toRecord(input: RecordStudyEventInput): StudyEventRecord {
  return {
    type: input.type,
    timestamp: input.timestamp ?? new Date().toISOString(),
    ...(input.topicId !== undefined && { topicId: input.topicId }),
    ...(input.questionId !== undefined && { questionId: input.questionId }),
    ...(input.flashcardId !== undefined && { flashcardId: input.flashcardId }),
    ...(input.quizSessionId !== undefined && { quizSessionId: input.quizSessionId }),
    ...(input.mockExamId !== undefined && { mockExamId: input.mockExamId }),
    ...(input.durationMs !== undefined && { durationMs: input.durationMs }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
  };
}

/** Registra un único evento de actividad. */
export async function recordStudyEvent(
  input: RecordStudyEventInput,
  database: ChuletaC1DB = defaultDb,
): Promise<void> {
  await database.studyEvents.add(toRecord(input));
}

/**
 * Registra varios eventos de una vez (p. ej. QUIZ_COMPLETED + un
 * QUESTION_ANSWERED/QUESTION_CORRECT/QUESTION_INCORRECT por cada respuesta
 * al completar un test). Un único `bulkAdd`, no N `add()` — más barato y no
 * dificulta el "todo o nada" cuando de verdad hace falta (el llamante decide
 * si envuelve esta llamada en su propio try/catch; ver cabecera del
 * fichero).
 */
export async function recordStudyEvents(
  inputs: readonly RecordStudyEventInput[],
  database: ChuletaC1DB = defaultDb,
): Promise<void> {
  if (inputs.length === 0) return;
  await database.studyEvents.bulkAdd(inputs.map(toRecord));
}

export interface QueryStudyEventsOptions {
  type?: StudyEventType;
  topicId?: TemaId;
  /** ISO 8601, inclusive. */
  since?: string;
  /** ISO 8601, inclusive. */
  until?: string;
  /** Tras aplicar todos los filtros y ordenar por fecha descendente. */
  limit?: number;
}

/**
 * Lee eventos, del más reciente al más antiguo. Dataset personal (no
 * multi-tenant): se elige el índice más selectivo disponible entre los
 * filtros pedidos (type > topicId > rango de fecha) para la consulta a
 * Dexie, y el resto de filtros (y el orden final) se aplican en memoria —
 * mismo enfoque que ya usan topicProgress.ts/flashcardProgress.ts para sus
 * datasets pequeños. No hay paginación por cursor todavía: `limit` recorta
 * el resultado ya ordenado, no la consulta a IndexedDB — suficiente para
 * los consumidores de las Fases 1-14 (todos leen ventanas acotadas: hoy,
 * esta semana, un tema, una sesión).
 */
export async function queryStudyEvents(
  options: QueryStudyEventsOptions = {},
  database: ChuletaC1DB = defaultDb,
): Promise<StudyEventRecord[]> {
  let rows: StudyEventRecord[];
  if (options.type !== undefined) {
    rows = await database.studyEvents.where('type').equals(options.type).toArray();
  } else if (options.topicId !== undefined) {
    rows = await database.studyEvents.where('topicId').equals(options.topicId).toArray();
  } else if (options.since !== undefined || options.until !== undefined) {
    const lower = options.since ?? '';
    // Límite superior más allá de cualquier ISO 8601 real (año 9999).
    const upper = options.until ?? '9999-12-31T23:59:59.999Z';
    rows = await database.studyEvents.where('timestamp').between(lower, upper, true, true).toArray();
  } else {
    rows = await database.studyEvents.toArray();
  }

  let filtered = rows;
  if (options.type !== undefined) filtered = filtered.filter((r) => r.type === options.type);
  if (options.topicId !== undefined) filtered = filtered.filter((r) => r.topicId === options.topicId);
  if (options.since !== undefined) filtered = filtered.filter((r) => r.timestamp >= options.since!);
  if (options.until !== undefined) filtered = filtered.filter((r) => r.timestamp <= options.until!);

  filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return options.limit !== undefined ? filtered.slice(0, options.limit) : filtered;
}
