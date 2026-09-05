// src/db/schema.ts
//
// Fase 3 — PERSISTENCE FOUNDATION. Formas de las tablas de IndexedDB
// (Dexie) para PROGRESO DE USUARIO. Esto es deliberadamente distinto del
// contenido académico (src/data/*.json, src/types/*.ts): estas tablas
// nunca contienen temario/preguntas/flashcards en sí, solo referencias
// estables a ellos (TemaId, QuestionId, flashcard id) — ver "QUESTION
// REFERENCES" en la especificación de Fase 3 y docs/adr/0006.
//
// Todas las fechas se guardan como string ISO 8601 UTC
// (`new Date().toISOString()`), nunca como Date ni timestamp numérico.

import type { TemaId } from '../types/content';
import type { QuestionId } from '../data/ids';
import type { AnswerKey } from '../types/quiz';

/** Nunca cambiar retroactivamente — ver docs/adr/0006-persistence-dexie.md. */
export const DB_NAME = 'chuletaC1';

/**
 * Versión de la migración desde legacy (localStorage["chuletaC1_v1"]), NO
 * la versión del schema de Dexie (esa es `db.version(N)` en db.ts). Un
 * entero que solo debe subir si en el futuro se añade un segundo paso de
 * migración legacy sobre datos nuevos — no confundir ambos contadores.
 */
export const LEGACY_MIGRATION_VERSION = 1;

/** Claves conocidas de la tabla `appMeta` — evita strings mágicos repetidos. */
export const APP_META_KEYS = {
  /** number — LEGACY_MIGRATION_VERSION una vez migrado (o marcado "nada que migrar"). */
  legacyMigrationVersion: 'legacyMigrationVersion',
  /** string ISO — se fija una única vez, la primera vez que se abre la base. */
  databaseCreatedAt: 'databaseCreatedAt',
  /**
   * number (índice en STUDY_FS_STEPS) — preferencia de tamaño de letra de
   * Estudiar. Migrado de `studyFsIndex` (legacy). Deliberadamente en
   * appMeta y NO en topicProgress: en legacy es una preferencia GLOBAL de
   * lectura (una única variable), no algo por tema — ver
   * docs/LEGACY_MIGRATION.md, sección studyFsIndex.
   */
  studyFsIndex: 'studyFsIndex',
} as const;

export type AppMetaKey = (typeof APP_META_KEYS)[keyof typeof APP_META_KEYS];

/** Fila de metadatos internos de la app. No guardar secretos ni datos de usuario aquí. */
export interface AppMetaRecord {
  key: string;
  value: unknown;
}

/**
 * Progreso de un tema de Estudiar. PK: topicId. Deliberadamente mínima:
 * legacy solo tenía `studied[topicId]: boolean` — no se inventan campos
 * (lastOpenedAt, streaks, etc.) que el legacy nunca tuvo.
 */
export interface TopicProgressRecord {
  topicId: TemaId;
  studied: boolean;
  updatedAt: string;
}

/**
 * Progreso de una flashcard. PK: flashcardId. Paridad funcional con legacy
 * (`known[cardId]: boolean`) — deliberadamente SIN SM-2/ease/intervals
 * (eso es una fase posterior, ver especificación de Fase 3).
 */
export interface FlashcardProgressRecord {
  flashcardId: string;
  known: boolean;
  updatedAt: string;
}

/**
 * Un test completado. `scope` es undefined en sesiones migradas desde
 * legacy (quizHistory legacy no registraba el alcance) — nunca se
 * fabrica; solo las sesiones nuevas (creadas desde esta fase en
 * adelante) lo llevan. `blankAnswers` existe por completitud de schema:
 * la UI actual no permite dejar una pregunta en blanco (hay que responder
 * para poder pulsar "Siguiente"), así que hoy siempre vale 0 — ver
 * docs/LEGACY_MIGRATION.md.
 *
 * `correctAnswers`/`incorrectAnswers` son opcionales porque las sesiones
 * migradas desde legacy (`quizHistory`) solo tenían `{date, total, pct}` —
 * `pct` está redondeado, así que reconstruir un recuento exacto de
 * aciertos a partir de él sería inventar precisión que el dato original
 * no tiene. Las sesiones NUEVAS (creadas desde esta fase, con sus
 * QuizAnswer reales) siempre los rellenan con el valor exacto.
 */
export interface QuizSessionRecord {
  id: string;
  startedAt: string;
  completedAt?: string;
  scope?: TemaId[];
  totalQuestions: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
  blankAnswers: number;
  completed: boolean;
  /**
   * true solo en filas creadas por la migración desde legacy
   * (quizHistory), que no tienen respuesta por respuesta — ver
   * QUIZ ANSWERS más abajo. Sesiones nuevas siempre tienen sus
   * QuizAnswer correspondientes.
   */
  migratedFromLegacy?: boolean;
  /**
   * Solo en filas migradas: el `pct` legacy tal cual (quizHistory[i].pct),
   * cuando `correctAnswers` no puede reconstruirse con exactitud (ver
   * arriba). Preferir `correctAnswers`/`totalQuestions` cuando existan.
   */
  legacyPct?: number;
}

/**
 * Una respuesta dentro de una sesión de test. `id` es autoincremental
 * (asignado por Dexie) porque no hay un identificador natural estable
 * más allá de (sessionId, questionId) — y una pregunta podría repetirse
 * dentro de una sesión en el futuro (p. ej. "repetir solo los fallos").
 * `selectedAnswer` no es opcional: con la UX actual toda respuesta
 * registrada tiene una letra real (no existe "dejar en blanco y
 * avanzar") — no hace falta un valor centinela ambiguo.
 */
export interface QuizAnswerRecord {
  id?: number;
  sessionId: string;
  questionId: QuestionId;
  selectedAnswer: AnswerKey;
  correct: boolean;
  answeredAt: string;
}

// ---------------------------------------------------------------------------
// STUDY INTELLIGENCE — Fase 1 (STUDY EVENT FOUNDATION).
//
// `studyEvents` es un registro de ACTIVIDAD, append-only: nunca se edita ni
// se borra desde la UI (salvo el futuro export/import de backup, Fase 24).
// No sustituye a `quizSessions`/`quizAnswers`/`topicProgress`/
// `flashcardProgress`, que siguen siendo la fuente de verdad de "qué es
// cierto ahora mismo" (p. ej. si un tema está leído). `studyEvents` es la
// fuente de verdad de "qué pasó y cuándo" — la base sobre la que se
// construyen rachas, tiempo de estudio, dominio de tema y detección de
// errores en fases posteriores. Un evento SIEMPRE referencia contenido
// canónico por su id estable (TemaId/QuestionId/flashcardId) — nunca copia
// el enunciado, el temario ni ningún otro dato académico.
//
// Ver docs/STUDY_INTELLIGENCE_ARCHITECTURE.md, sección 2.2, para el
// razonamiento completo de cada decisión de este tipo.
export type StudyEventType =
  | 'TOPIC_OPENED'
  | 'TOPIC_COMPLETED'
  | 'QUESTION_ANSWERED'
  | 'QUESTION_CORRECT'
  | 'QUESTION_INCORRECT'
  | 'FLASHCARD_REVIEWED'
  | 'FLASHCARD_KNOWN'
  | 'FLASHCARD_FAILED'
  | 'QUIZ_STARTED'
  | 'QUIZ_COMPLETED'
  | 'MOCK_EXAM_STARTED'
  | 'MOCK_EXAM_COMPLETED'
  | 'NOTE_CREATED'
  | 'QUESTION_STARRED'
  | 'ERROR_REVIEWED'
  | 'STUDY_SESSION_STARTED'
  | 'STUDY_SESSION_ENDED';

/**
 * `id` es autoincremental: un evento no tiene identidad natural propia más
 * allá de "este tipo de cosa, para esta referencia, en este instante" — a
 * diferencia de `QuizAnswerRecord` (donde tampoco hay id natural, por la
 * misma razón). Los campos de referencia son todos opcionales porque cada
 * `StudyEventType` solo rellena los que le aplican (p. ej. `FLASHCARD_KNOWN`
 * nunca lleva `questionId`) — se documenta caso por caso en
 * `src/db/studyEvents.ts`, no aquí con tipos discriminados por ahora
 * (mantenerlo simple hasta que un consumidor real necesite esa precisión).
 */
export interface StudyEventRecord {
  id?: number;
  type: StudyEventType;
  /** ISO 8601 UTC — igual que el resto de fechas del proyecto. Es el instante REAL del evento, no el instante en que se persiste (ver recordStudyEvent). */
  timestamp: string;
  topicId?: TemaId;
  questionId?: QuestionId;
  flashcardId?: string;
  quizSessionId?: string;
  mockExamId?: string;
  durationMs?: number;
  /** Libre pero deliberado: cada emisor documenta explícitamente qué guarda aquí. Nunca texto libre de usuario (eso vive en `notes`, Fase 5). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// STUDY INTELLIGENCE — Fase 2 (CUADERNO DE ERRORES).
//
// `errorRecords` es metadato de SEGUIMIENTO por pregunta, no contenido: la
// PK es el propio QuestionId canónico (una pregunta solo puede tener un
// registro de error — no tiene sentido "duplicarlo"), y en ningún campo se
// copia el enunciado, las opciones ni la respuesta correcta — eso se sigue
// resolviendo siempre contra el banco canónico vía getQuestionById()
// (src/data/index.ts). Si esa pregunta desapareciera del banco actual, el
// registro de error seguiría siendo válido como dato histórico (igual que
// QuizAnswerRecord ya tolera esto, ver MorePage.tsx `HistoryAnswer`).
//
// Progresión de `status` (ver src/db/errorRecords.ts para la máquina de
// estados completa):
//   NEW       — solo se ha fallado una vez, nunca acertada desde entonces.
//   LEARNING  — ha fallado (una o más veces) y aún no encadena ningún
//               acierto desde el último fallo (incluye el caso de una
//               regresión: una pregunta ya MASTERED/REVIEWING que se
//               vuelve a fallar).
//   REVIEWING — encadena al menos un acierto desde el último fallo, pero
//               menos que el umbral de dominio.
//   MASTERED  — encadena aciertos suficientes desde el último fallo como
//               para considerarla superada (no se elimina del cuaderno:
//               "dominada" es un estado visible, no una salida silenciosa).
export type ErrorStatus = 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';

export interface ErrorRecord {
  questionId: QuestionId;
  topicId: TemaId;
  firstFailedAt: string;
  lastFailedAt: string;
  /** Nº total de veces que se ha fallado esta pregunta, histórico (nunca se reinicia). */
  failureCount: number;
  /** Aciertos consecutivos desde el ÚLTIMO fallo (se reinicia a 0 en cada fallo nuevo, incluida una regresión). */
  correctCountAfterFailure: number;
  /** Instante del último acierto contabilizado; undefined si aún no se ha acertado tras fallarla. */
  lastReviewedAt?: string;
  status: ErrorStatus;
  /** Derivado de correctCountAfterFailure/ERROR_MASTERY_THRESHOLD, en [0,1] — ver src/db/errorRecords.ts. Redundante con status a propósito: permite ordenar/barra de progreso sin recalcular la lógica de estados en la UI. */
  masteryScore: number;
}

/**
 * Marca de qué sesiones de test ya se han plegado en `errorRecords` — IGUAL
 * PRINCIPIO que la idempotencia por sessionId de recordQuizSession
 * (src/db/quiz.ts): si SAFE QUIZ COMPLETION obliga a reintentar el guardado
 * de una sesión (Fase 3B), sin esto cada reintento re-aplicaría sus
 * respuestas al cuaderno y falsearía failureCount/correctCountAfterFailure
 * (a diferencia de studyEvents, que es un log de actividad donde una
 * entrada duplicada es solo ruido; aquí sería un error real de datos).
 */
export interface ErrorNotebookProcessedSessionRecord {
  sessionId: string;
  processedAt: string;
}
