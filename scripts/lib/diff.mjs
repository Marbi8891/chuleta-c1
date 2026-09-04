// scripts/lib/diff.mjs
//
// Diff determinista y simple (NO un motor de diff genérico) para señalar el
// PRIMER registro que difiere entre una re-extracción fresca del legacy y
// el contenido ya comprometido en src/data/. Pensado para el modelo de
// datos concreto de Chuleta C1 (STUDYBANK/QUIZBANK/FLASHCARDS), no para
// reusarse en otro contexto.

import { buildQuestionId } from '../../src/data/ids.impl.mjs';

/**
 * @param {any[]} freshQuiz
 * @param {any[]} committedQuiz
 */
function firstQuestionMismatch(freshQuiz, committedQuiz) {
  const freshById = new Map(freshQuiz.map((qb) => [qb.id, qb]));
  for (const bank of committedQuiz) {
    const legacyBank = freshById.get(bank.id);
    if (!legacyBank) {
      return { record: bank.id, field: '(banco completo)', legacy: '(no existe)', extracted: '(existe)' };
    }
    const legacyByNum = new Map(legacyBank.questions.map((q) => [q.num, q]));
    for (const q of bank.questions) {
      const legacyQ = legacyByNum.get(q.num);
      const questionId = buildQuestionId(bank.id, q.num);
      if (!legacyQ) {
        return { record: questionId, field: '(pregunta completa)', legacy: '(no existe)', extracted: '(existe)' };
      }
      if (q.stem !== legacyQ.stem) {
        return { record: questionId, field: 'stem', legacy: legacyQ.stem, extracted: q.stem };
      }
      if (JSON.stringify(q.opts) !== JSON.stringify(legacyQ.opts)) {
        return { record: questionId, field: 'opts', legacy: JSON.stringify(legacyQ.opts), extracted: JSON.stringify(q.opts) };
      }
      if (q.answer !== legacyQ.answer) {
        return { record: questionId, field: 'answer', legacy: legacyQ.answer, extracted: q.answer };
      }
    }
  }
  return null;
}

/**
 * @param {any[]} freshStudy
 * @param {any[]} committedStudy
 */
function firstStudyMismatch(freshStudy, committedStudy) {
  const freshById = new Map(freshStudy.map((t) => [t.id, t]));
  for (const topic of committedStudy) {
    const legacyTopic = freshById.get(topic.id);
    if (!legacyTopic) {
      return { record: topic.id, field: '(tema completo)', legacy: '(no existe)', extracted: '(existe)' };
    }
    if (topic.title !== legacyTopic.title) {
      return { record: topic.id, field: 'title', legacy: legacyTopic.title, extracted: topic.title };
    }
    if (topic.markdown !== legacyTopic.markdown) {
      return { record: topic.id, field: 'markdown', legacy: '(ver legacy)', extracted: '(ver extracted — difieren en contenido)' };
    }
  }
  return null;
}

/**
 * @param {any[]} freshFc
 * @param {any[]} committedFc
 */
function firstFlashcardMismatch(freshFc, committedFc) {
  const freshById = new Map(freshFc.map((f) => [f.id, f]));
  for (const card of committedFc) {
    const legacyCard = freshById.get(card.id);
    if (!legacyCard) {
      return { record: card.id, field: '(flashcard completa)', legacy: '(no existe)', extracted: '(existe)' };
    }
    if (card.front !== legacyCard.front) {
      return { record: card.id, field: 'front', legacy: legacyCard.front, extracted: card.front };
    }
    if (card.back !== legacyCard.back) {
      return { record: card.id, field: 'back', legacy: legacyCard.back, extracted: card.back };
    }
  }
  return null;
}

/**
 * Encuentra el primer registro que difiere entre `fresh` (re-extracción del
 * legacy) y `committed` (src/data/*.json), buscando primero en preguntas
 * (el caso más habitual y más específico), luego en temas de estudio, luego
 * en flashcards. Devuelve null si no encuentra diferencia campo a campo
 * (lo cual, si equivalenceOk es false, indicaría una diferencia estructural
 * más gorda — ej. distinto número de elementos — no cubierta por este diff
 * simple).
 *
 * @param {{STUDYBANK: any[], QUIZBANK: any[], FLASHCARDS: any[]}} fresh
 * @param {{STUDYBANK: any[], QUIZBANK: any[], FLASHCARDS: any[]}} committed
 */
export function findFirstEquivalenceMismatch(fresh, committed) {
  return (
    firstQuestionMismatch(fresh.QUIZBANK, committed.QUIZBANK) ??
    firstStudyMismatch(fresh.STUDYBANK, committed.STUDYBANK) ??
    firstFlashcardMismatch(fresh.FLASHCARDS, committed.FLASHCARDS)
  );
}
