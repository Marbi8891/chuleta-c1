// src/data/index.test.ts
//
// Cubre los requisitos mínimos de Fase 2 para la capa de datos:
// getQuestionById funciona, y el QuestionId es estable (no depende del
// índice del array). Usa el contenido real ya empaquetado — no hace falta
// una fixture aparte: el propio pipeline de integridad (tests/*.test.mjs)
// ya garantiza que este contenido es el correcto.

import { describe, expect, it } from 'vitest';
import { getQuestionById, getQuestions, getTopics } from './index';

describe('capa de acceso a datos', () => {
  it('getQuestionById resuelve una pregunta real por su QuestionId', () => {
    const [first] = getQuestions();
    expect(first).toBeDefined();
    expect(getQuestionById(first!.id)).toEqual(first);
  });

  it('getQuestionById devuelve undefined para un QuestionId inexistente', () => {
    expect(getQuestionById('Z-T99-Q999')).toBeUndefined();
  });

  it('el QuestionId tiene el formato <topicId>-Q<NNN> y es estable entre llamadas', () => {
    const a = getQuestions();
    const b = getQuestions();
    expect(a.length).toBe(b.length);
    expect(a[0]!.id).toBe(b[0]!.id);
    expect(a[0]!.id).toMatch(/^[IVX]+-T\d{2}-Q\d{3}$/);
  });

  it('el QuestionId identifica la pregunta con independencia de su posición en el array', () => {
    const questions = getQuestions();
    const middle = questions[Math.floor(questions.length / 2)]!;
    // Buscar por id, no por índice: debe encontrar exactamente la misma pregunta.
    expect(getQuestionById(middle.id)).toEqual(middle);
  });

  it('hay al menos un tema cargado con contenido markdown', () => {
    const topics = getTopics();
    expect(topics.length).toBeGreaterThan(0);
    expect(topics[0]!.markdown.length).toBeGreaterThan(0);
  });
});
