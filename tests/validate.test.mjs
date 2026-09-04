// tests/validate.test.mjs
//
// Tests unitarios de scripts/lib/validate.mjs contra fixtures mínimos en
// memoria (sin tocar ficheros ni el dataset real). Cada test rompe UNA sola
// regla y comprueba que validateContent la detecta con un mensaje
// accionable (no solo "ok: false").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateContent } from '../scripts/lib/validate.mjs';
import { buildQuestionId } from '../src/data/ids.impl.mjs';

function baseContent() {
  return {
    STUDYBANK: [
      { bloque: 'I', tema: 'T01', title: 'Tema 1', markdown: '# Tema 1\ncontenido', id: 'I-T01' },
      { bloque: 'I', tema: 'T02', title: 'Tema 2', markdown: '# Tema 2\ncontenido', id: 'I-T02' },
    ],
    QUIZBANK: [
      {
        bloque: 'I', tema: 'T01', file: 'x', title: 'Test 1', bloqueName: 'Bloque I', id: 'I-T01',
        questions: [
          { num: 1, stem: 'P1', opts: ['a', 'b', 'c', 'd'], answer: 'a' },
          { num: 2, stem: 'P2', opts: ['a', 'b', 'c', 'd'], answer: 'b' },
        ],
      },
      {
        bloque: 'I', tema: 'T02', file: 'x', title: 'Test 2', bloqueName: 'Bloque I', id: 'I-T02',
        questions: [
          { num: 1, stem: 'P1', opts: ['a', 'b', 'c', 'd'], answer: 'c' },
        ],
      },
    ],
    FLASHCARDS: [
      { id: 'c1', bloque: 'I', tema: 'T01', id_tema: 'I-T01', temaTitle: 'Tema 1', bloqueName: 'Bloque I', front: 'f', back: 'b' },
    ],
  };
}

const BASELINE = { studyTopics: 2, quizBanks: 2, questions: 3, flashcards: 1 };
const LIMITS = { baseline: BASELINE };

test('contenido base bien formado: pasa sin problemas', () => {
  const { ok, problems } = validateContent(baseContent(), LIMITS);
  assert.equal(ok, true, JSON.stringify(problems));
});

test('TEST 4/6 — respuesta alterada a una clave inválida: FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[0].questions[0].answer = 'z';
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.invalidAnswers, 1);
  assert.ok(problems.some((p) => p.includes('I-T01#1') && p.includes('inválida')));
});

test('TEST 5 — opción vacía: FAIL con ID accionable', () => {
  const c = baseContent();
  c.QUIZBANK[1].questions[0].opts[2] = '   ';
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.blankOptions, 1);
  assert.ok(problems.some((p) => p === 'I-T02#1 has blank option "c"'));
});

test('TEST 7 — número de pregunta duplicado: FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[0].questions[1].num = 1; // duplica el num=1 ya existente
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.ok(report.duplicateQuestionNumbers >= 1);
  assert.ok(problems.some((p) => p.includes('I-T01') && p.includes('duplicado')));
});

test('TEST 8 — hueco en la numeración (1, 2, 4): FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[0].questions.push({ num: 4, stem: 'P4', opts: ['a', 'b', 'c', 'd'], answer: 'd' });
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.questionNumberSequences, false);
  assert.ok(problems.some((p) => p.includes('I-T01') && p.includes('secuencial')));
});

test('TEST 9 — stem en blanco: FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[0].questions[0].stem = '   ';
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.blankStems, 1);
  assert.ok(problems.some((p) => p === 'I-T01#1: stem en blanco'));
});

test('TEST 10 — opción en blanco (variante con string vacía): FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[0].questions[0].opts[0] = '';
  const { report } = validateContent(c, LIMITS);
  assert.equal(report.blankOptions, 1);
});

test('TEST 11 — quiz bank id duplicado: FAIL', () => {
  const c = baseContent();
  c.QUIZBANK[1].id = 'I-T01'; // duplica el id del primer banco
  c.QUIZBANK[1].bloque = 'I';
  c.QUIZBANK[1].tema = 'T01';
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.duplicateQuizBankIds, 1);
  assert.ok(problems.some((p) => p.includes('banco de test duplicados')));
});

test('TEST 12 — banco de test apuntando a un tema inexistente: FAIL (orphan)', () => {
  const c = baseContent();
  c.QUIZBANK.push({
    bloque: 'I', tema: 'T99', file: 'x', title: 'Fantasma', bloqueName: 'Bloque I', id: 'I-T99',
    questions: [{ num: 1, stem: 'P', opts: ['a', 'b', 'c', 'd'], answer: 'a' }],
  });
  const { ok, problems, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.orphanQuestions, 1);
  assert.ok(problems.some((p) => p.includes('I-T99')));
});

test('TEST 13/14 — QuestionId: se generan todos, son únicos y con el formato <topic>-Q<NNN>', () => {
  const c = baseContent();
  const { report } = validateContent(c, LIMITS);
  assert.equal(report.generatedQuestionIds, 3);
  assert.equal(report.uniqueQuestionIds, 3);
  assert.equal(report.duplicateQuestionIds, 0);
  assert.equal(buildQuestionId('I-T01', 1), 'I-T01-Q001');
  assert.equal(buildQuestionId('I-T01', 20), 'I-T01-Q020');
});

test('flashcard huérfana (id_tema inexistente): FAIL', () => {
  const c = baseContent();
  c.FLASHCARDS.push({ id: 'c99', bloque: 'I', tema: 'T99', id_tema: 'I-T99', temaTitle: 'x', bloqueName: 'x', front: 'f', back: 'b' });
  const { ok, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.orphanFlashcards, 1);
});

test('bloque desconocido: FAIL sin inventar bloques nuevos', () => {
  const c = baseContent();
  c.STUDYBANK[0].bloque = 'VII'; // fuera de BLOQUE_ORDER conocido (I..VI)
  const { ok, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.blockConsistency, false);
});

test('orden de temas divergente entre STUDYBANK y QUIZBANK: FAIL', () => {
  const c = baseContent();
  c.QUIZBANK.reverse();
  const { ok, report } = validateContent(c, LIMITS);
  assert.equal(ok, false);
  assert.equal(report.topicOrderConsistent, false);
});

test('baseline: una reducción inesperada de conteos falla aunque no haya huérfanos ni duplicados', () => {
  const c = baseContent();
  c.STUDYBANK.pop();
  c.QUIZBANK.pop();
  const { ok, problems } = validateContent(c, LIMITS); // baseline sigue pidiendo 2 temas
  assert.equal(ok, false);
  assert.ok(problems.some((p) => p.includes('STUDY TOPICS')));
  assert.ok(problems.some((p) => p.includes('QUIZ BANKS')));
});

test('NON-REGRESSION FLOOR: baseline reducido a la par que el contenido real sigue fallando contra el floor histórico', () => {
  // Escenario del caso de auditoría: alguien reduce legacy a 1/1/1/1 y
  // "sincroniza" baseline a 1/1/1/1 también, así que baseline === actual.
  // Sin un floor independiente esto pasaría igual. Con el floor, no.
  const c = baseContent();
  c.STUDYBANK = [c.STUDYBANK[0]];
  c.QUIZBANK = [{ ...c.QUIZBANK[0], questions: [c.QUIZBANK[0].questions[0]] }];
  c.FLASHCARDS = [c.FLASHCARDS[0]];

  const reducedBaseline = { studyTopics: 1, quizBanks: 1, questions: 1, flashcards: 1 };
  const floor = { studyTopics: 25, quizBanks: 25, questions: 500, flashcards: 165 };

  // Sin floor: baseline reducido "a juego" con el contenido pasa.
  const withoutFloor = validateContent(c, { baseline: reducedBaseline });
  assert.equal(withoutFloor.ok, true, 'precondición: sin floor, un baseline sincronizado a la baja no debe fallar por sí solo');

  // Con floor: debe fallar, aunque baseline === actual.
  const withFloor = validateContent(c, { baseline: reducedBaseline, nonRegressionFloor: floor });
  assert.equal(withFloor.ok, false);
  assert.equal(withFloor.report.nonRegressionFloorOk, false);
  assert.ok(withFloor.problems.some((p) => p.includes('NON-REGRESSION FLOOR') && p.includes('STUDY TOPICS')));
  assert.ok(withFloor.problems.some((p) => p.includes('NON-REGRESSION FLOOR') && p.includes('QUESTIONS')));
  assert.ok(withFloor.problems.some((p) => p.includes('NON-REGRESSION FLOOR') && p.includes('FLASHCARDS')));
});
