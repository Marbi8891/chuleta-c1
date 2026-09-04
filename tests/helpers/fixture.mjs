// tests/helpers/fixture.mjs
//
// Genera un "legacy HTML" sintético pequeño (2 temas, 3 preguntas por tema,
// 2 flashcards) con la misma forma que legacy/index.original.html, para
// probar el pipeline (SHA gate, extracción atómica, promoción) sin copiar
// el dataset real de 500 preguntas dentro de los tests.

import { createHash } from 'node:crypto';

function sha256(str) {
  return createHash('sha256').update(str, 'utf-8').digest('hex');
}

/**
 * @param {{ breakAnswer?: boolean, tweakStem?: boolean }} [opts]
 *   breakAnswer: si true, la primera pregunta tiene answer inválida ("z")
 *     sin cambiar el conteo de preguntas — para probar que la validación
 *     estructural detecta corrupción de contenido, no solo de conteo.
 *   tweakStem: si true, cambia el texto del stem de la primera pregunta
 *     (para simular una "fuente legacy modificada" cuyo SHA ya no coincide
 *     con el esperado).
 */
export function buildFixtureHtml({ breakAnswer = false, tweakStem = false } = {}) {
  const STUDYBANK = [
    { bloque: 'I', tema: 'T01', title: 'Tema de prueba uno', markdown: '# Tema 1\n\nContenido de prueba.', id: 'I-T01' },
    { bloque: 'I', tema: 'T02', title: 'Tema de prueba dos', markdown: '# Tema 2\n\nOtro contenido de prueba.', id: 'I-T02' },
  ];

  const makeQuestions = (topicId) =>
    [1, 2, 3].map((num) => ({
      num,
      stem: tweakStem && topicId === 'I-T01' && num === 1 ? 'Enunciado MODIFICADO para el test' : `Pregunta ${num} de ${topicId}`,
      opts: ['Opción A', 'Opción B', 'Opción C', 'Opción D'],
      answer: breakAnswer && topicId === 'I-T01' && num === 1 ? 'z' : 'a',
    }));

  const QUIZBANK = [
    { bloque: 'I', tema: 'T01', file: 'legacy-t01.json', title: 'Test tema 1', bloqueName: 'Bloque I — Materias comunes', id: 'I-T01', questions: makeQuestions('I-T01') },
    { bloque: 'I', tema: 'T02', file: 'legacy-t02.json', title: 'Test tema 2', bloqueName: 'Bloque I — Materias comunes', id: 'I-T02', questions: makeQuestions('I-T02') },
  ];

  const FLASHCARDS = [
    { id: 'c1', bloque: 'I', tema: 'T01', id_tema: 'I-T01', temaTitle: 'Tema de prueba uno', bloqueName: 'Bloque I — Materias comunes', front: 'Frente 1', back: 'Dorso 1' },
    { id: 'c2', bloque: 'I', tema: 'T02', id_tema: 'I-T02', temaTitle: 'Tema de prueba dos', bloqueName: 'Bloque I — Materias comunes', front: 'Frente 2', back: 'Dorso 2' },
  ];

  const html = `<!doctype html>
<html><head><title>Fixture</title></head>
<body>
<script>
const STUDYBANK = ${JSON.stringify(STUDYBANK)};
const QUIZBANK = ${JSON.stringify(QUIZBANK)};
const FLASHCARDS = ${JSON.stringify(FLASHCARDS)};
</script>
</body></html>
`;

  return {
    html,
    sha256: sha256(html),
    baseline: { studyTopics: 2, quizBanks: 2, questions: 6, flashcards: 2 },
  };
}
