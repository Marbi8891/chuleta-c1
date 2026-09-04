// src/data/index.ts
//
// Data Access Layer — punto único de acceso al contenido de Chuleta C1.
//
// Decisión (ver docs/adr/0001-offline-data-bundling.md): los tres JSON se
// importan como módulos ES. Vite los inlinea en el bundle en build time, así
// que no hay fetch ni dependencia de red en runtime — la app funciona en
// modo avión sin cambios adicionales.
//
// Ningún componente debe hacer `import data from '.../study_bank.json'`
// directamente: todo pasa por las funciones de este módulo, para que el
// origen del dato (hoy: JSON estático embebido) se pueda cambiar en el
// futuro sin tocar la capa de features.

import studyBankRaw from './study_bank.json';
import quizBankRaw from './quiz_bank.json';
import flashcardsRaw from './flashcards.json';
import { buildQuestionId } from './ids';
import type { QuestionId } from './ids';
import type { StudyTopic } from '../types/study';
import type { QuizBank, QuestionRef } from '../types/quiz';
import type { Flashcard } from '../types/flashcard';
import type { TemaId } from '../types/content';

const STUDY_BANK = studyBankRaw as StudyTopic[];
const QUIZ_BANK = quizBankRaw as QuizBank[];
const FLASHCARDS = flashcardsRaw as Flashcard[];

/**
 * Conversión comprobada (sin cast) de string[] a la tupla de 4 que espera
 * QuestionRef: desestructura y comprueba cada posición, así TypeScript
 * estrecha el tipo por control de flujo real, no por afirmación.
 */
function toQuadruple(opts: string[]): readonly [string, string, string, string] {
  const [a, b, c, d] = opts;
  if (opts.length !== 4 || a === undefined || b === undefined || c === undefined || d === undefined) {
    throw new Error(`toQuadruple: se esperaban 4 opciones, hay ${opts.length}`);
  }
  return [a, b, c, d];
}

// Índices construidos una sola vez al cargar el módulo (dataset pequeño:
// 25 temas / 25 bancos / 165 flashcards / 500 preguntas — no justifica nada
// más elaborado que unos Map).
const studyById = new Map<TemaId, StudyTopic>(STUDY_BANK.map((t) => [t.id, t]));
const quizById = new Map<TemaId, QuizBank>(QUIZ_BANK.map((q) => [q.id, q]));

const flashcardsByTema = new Map<TemaId, Flashcard[]>();
for (const card of FLASHCARDS) {
  const list = flashcardsByTema.get(card.id_tema) ?? [];
  list.push(card);
  flashcardsByTema.set(card.id_tema, list);
}

const allQuestionRefs: QuestionRef[] = [];
const questionRefsByTopic = new Map<TemaId, QuestionRef[]>();
const questionRefById = new Map<QuestionId, QuestionRef>();
for (const qb of QUIZ_BANK) {
  const refs: QuestionRef[] = qb.questions.map((q) => ({
    id: buildQuestionId(qb.id, q.num),
    topicId: qb.id,
    number: q.num,
    stem: q.stem,
    opts: toQuadruple(q.opts),
    answer: q.answer,
  }));
  questionRefsByTopic.set(qb.id, refs);
  for (const ref of refs) {
    allQuestionRefs.push(ref);
    questionRefById.set(ref.id, ref);
  }
}

// ---- Temas de estudio -----------------------------------------------------

/** Todos los temas de estudio, en el orden del origen. */
export function getTopics(): readonly StudyTopic[] {
  return STUDY_BANK;
}

/** Un tema de estudio por id compuesto (ej. "I-T01"), o undefined si no existe. */
export function getTopicById(id: TemaId): StudyTopic | undefined {
  return studyById.get(id);
}

// ---- Tests / preguntas ------------------------------------------------------

/** Todos los bancos de test, en su forma legacy (sin enriquecer), en el orden del origen. */
export function getQuizBanks(): readonly QuizBank[] {
  return QUIZ_BANK;
}

/** El banco de test de un tema concreto, en forma legacy, o undefined si no existe. */
export function getQuizBankByTopic(id: TemaId): QuizBank | undefined {
  return quizById.get(id);
}

/** Todas las preguntas de todos los temas, enriquecidas con QuestionId global (500 en el dataset actual). */
export function getQuestions(): readonly QuestionRef[] {
  return allQuestionRefs;
}

/** Las preguntas de un tema concreto, enriquecidas con QuestionId global. */
export function getQuestionsByTopic(id: TemaId): readonly QuestionRef[] {
  return questionRefsByTopic.get(id) ?? [];
}

/** Resuelve una pregunta por su QuestionId global (ej. "I-T01-Q001"). */
export function getQuestionById(questionId: QuestionId): QuestionRef | undefined {
  return questionRefById.get(questionId);
}

// ---- Flashcards -------------------------------------------------------------

/** Todas las flashcards, en el orden del origen. */
export function getFlashcards(): readonly Flashcard[] {
  return FLASHCARDS;
}

/** Las flashcards asociadas a un tema concreto. */
export function getFlashcardsByTopic(id: TemaId): readonly Flashcard[] {
  return flashcardsByTema.get(id) ?? [];
}
