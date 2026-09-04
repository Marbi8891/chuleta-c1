// src/data/ids.impl.d.mts
//
// Declaración de tipos para ids.impl.mjs (implementación única, en JS
// plano). TypeScript empareja automáticamente un `.mjs` con un `.d.mts`
// del mismo nombre, así que src/data/ids.ts obtiene tipos reales al
// importar './ids.impl.mjs' sin necesitar `allowJs`.

export type QuestionId = string;

export function buildQuestionId(topicId: string, questionNumber: number): QuestionId;
export function isWellFormedQuestionId(value: string): boolean;
