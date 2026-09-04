// src/features/quiz/buildQuizPool.ts
//
// Migración de buildQuizPool() (legacy/index.original.html líneas 782-789),
// sin el mezclado (que queda a cargo del llamante, vía shuffle() de
// QuizContext — igual que en legacy, donde el shuffle ocurre justo después
// de construir el pool). Recorre los bancos en el mismo orden que QUIZBANK,
// filtrando por alcance, y aplana sus preguntas — igual que el
// `QUIZBANK.filter(...).forEach(t=>t.questions.forEach(...))` original.

import { getQuestionsByTopic, getQuizBanks } from '../../data/index';
import type { TemaId } from '../../types/content';
import type { QuestionRef } from '../../types/quiz';

export function buildQuizPool(scope: ReadonlySet<TemaId>): QuestionRef[] {
  const pool: QuestionRef[] = [];
  for (const qb of getQuizBanks()) {
    if (!scope.has(qb.id)) continue;
    pool.push(...getQuestionsByTopic(qb.id));
  }
  return pool;
}
