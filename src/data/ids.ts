// src/data/ids.ts
//
// Envoltorio TypeScript fino sobre la implementación única de
// buildQuestionId (src/data/ids.impl.mjs). No hay lógica propia aquí: solo
// tipos, para que el futuro código React/Vite importe desde un módulo .ts
// como el resto de la capa de datos. Ver
// docs/adr/0003-node-tooling-portability.md para la razón de este split.
//
// TemaId es más específico que el `string` que usa la implementación JS;
// se re-tipa aquí en el borde, sin tocar la implementación.

import { buildQuestionId as buildQuestionIdImpl, isWellFormedQuestionId } from './ids.impl.mjs';
import type { TemaId } from '../types/content';

export type QuestionId = string;

export function buildQuestionId(topicId: TemaId, questionNumber: number): QuestionId {
  return buildQuestionIdImpl(topicId, questionNumber);
}

export { isWellFormedQuestionId };
