// tests/legacy-equivalence.test.mjs
//
// Prueba de equivalencia legacy → extracted. No usa ningún framework externo
// (node:test es nativo desde Node 18) porque en esta fase el proyecto no
// tiene ninguna otra dependencia y no queremos añadir una solo para esto.
//
// Ejecutar: node --test tests/
//
// Esta prueba es deliberadamente redundante con scripts/verify-content.mjs:
// verify-content es la puerta que se ejecuta en CI/pre-build y da un
// resumen legible; este test es la forma "unitaria" de demostrar lo mismo,
// con aserciones por campo en vez de un resumen agregado, para que un fallo
// señale exactamente qué registro y qué propiedad han cambiado.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractContent } from '../scripts/lib/extract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const legacyHtml = readFileSync(path.join(ROOT, 'legacy', 'index.original.html'), 'utf-8');
const fresh = extractContent(legacyHtml);

const committedStudy = JSON.parse(readFileSync(path.join(ROOT, 'src/data/study_bank.json'), 'utf-8'));
const committedQuiz = JSON.parse(readFileSync(path.join(ROOT, 'src/data/quiz_bank.json'), 'utf-8'));
const committedFc = JSON.parse(readFileSync(path.join(ROOT, 'src/data/flashcards.json'), 'utf-8'));

test('study_bank.json: mismo número de temas que el legacy', () => {
  assert.equal(committedStudy.length, fresh.STUDYBANK.length);
});

test('study_bank.json: cada tema coincide campo a campo con el legacy (id, title, markdown)', () => {
  const freshById = new Map(fresh.STUDYBANK.map((t) => [t.id, t]));
  for (const topic of committedStudy) {
    const legacyTopic = freshById.get(topic.id);
    assert.ok(legacyTopic, `El tema ${topic.id} no existe en el legacy`);
    assert.equal(topic.title, legacyTopic.title, `Título distinto en ${topic.id}`);
    assert.equal(topic.markdown, legacyTopic.markdown, `Markdown distinto en ${topic.id}`);
    assert.equal(topic.bloque, legacyTopic.bloque, `Bloque distinto en ${topic.id}`);
  }
});

test('quiz_bank.json: mismo número de bancos y de preguntas totales que el legacy', () => {
  assert.equal(committedQuiz.length, fresh.QUIZBANK.length);
  const committedTotal = committedQuiz.reduce((a, qb) => a + qb.questions.length, 0);
  const freshTotal = fresh.QUIZBANK.reduce((a, qb) => a + qb.questions.length, 0);
  assert.equal(committedTotal, freshTotal);
});

test('quiz_bank.json: cada pregunta coincide (stem, opts, answer) con el legacy', () => {
  const freshById = new Map(fresh.QUIZBANK.map((qb) => [qb.id, qb]));
  for (const bank of committedQuiz) {
    const legacyBank = freshById.get(bank.id);
    assert.ok(legacyBank, `El banco ${bank.id} no existe en el legacy`);
    assert.equal(bank.questions.length, legacyBank.questions.length, `Nº de preguntas distinto en ${bank.id}`);
    for (let i = 0; i < bank.questions.length; i++) {
      const q = bank.questions[i];
      const legacyQ = legacyBank.questions[i];
      assert.equal(q.stem, legacyQ.stem, `Enunciado distinto en ${bank.id}#${q.num}`);
      assert.deepEqual(q.opts, legacyQ.opts, `Opciones distintas en ${bank.id}#${q.num}`);
      assert.equal(q.answer, legacyQ.answer, `Respuesta distinta en ${bank.id}#${q.num}`);
    }
  }
});

test('flashcards.json: mismo número y contenido que el legacy', () => {
  assert.equal(committedFc.length, fresh.FLASHCARDS.length);
  const freshById = new Map(fresh.FLASHCARDS.map((f) => [f.id, f]));
  for (const card of committedFc) {
    const legacyCard = freshById.get(card.id);
    assert.ok(legacyCard, `La flashcard ${card.id} no existe en el legacy`);
    assert.equal(card.front, legacyCard.front, `front distinto en ${card.id}`);
    assert.equal(card.back, legacyCard.back, `back distinto en ${card.id}`);
    assert.equal(card.id_tema, legacyCard.id_tema, `id_tema distinto en ${card.id}`);
  }
});
