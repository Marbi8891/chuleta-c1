#!/usr/bin/env node
// scripts/verify-content.mjs
//
// Puerta de integridad standalone (no escribe nada, solo lee y reporta).
// Capas independientes, todas deben pasar:
//
//   1. SHA GATE            — legacy/index.original.html no ha cambiado.
//   2. EQUIVALENCE         — re-extraer desde legacy produce EXACTAMENTE lo
//                             que hay hoy en src/data/*.json (deep-equal,
//                             no solo conteos). Si falla, se imprime el
//                             PRIMER registro concreto que difiere (ver
//                             scripts/lib/diff.mjs) — nunca solo "difiere".
//   3. VALIDACIÓN          — reglas estructurales sobre el contenido
//                             comprometido (duplicados, huérfanos, formato,
//                             secuencias, IDs de pregunta, bloques
//                             conocidos, baseline exacto Y non-regression
//                             floor), delegada en scripts/lib/validate.mjs.
//
// Sale con código != 0 si cualquier capa falla.

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractContent } from './lib/extract.mjs';
import { validateContent } from './lib/validate.mjs';
import { findFirstEquivalenceMismatch } from './lib/diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CHULETA_TEST_ROOT
  ? path.resolve(process.env.CHULETA_TEST_ROOT)
  : path.resolve(__dirname, '..');

const LEGACY_PATH = path.join(ROOT, 'legacy', 'index.original.html');
const INTEGRITY_PATH = path.join(ROOT, 'CONTENT_INTEGRITY.json');
const DATA_DIR = path.join(ROOT, 'src', 'data');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf-8'));
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function main() {
  const problems = [];

  if (!existsSync(LEGACY_PATH)) {
    console.error(`ERROR: no existe ${LEGACY_PATH}`);
    process.exit(1);
  }
  if (!existsSync(INTEGRITY_PATH)) {
    console.error(`ERROR: no existe ${INTEGRITY_PATH}`);
    process.exit(1);
  }

  const integrity = readJson(INTEGRITY_PATH);
  const expectedHash = integrity.legacySource?.sha256 ?? integrity.source?.sha256;

  const legacyBuf = readFileSync(LEGACY_PATH);
  const legacyHtml = legacyBuf.toString('utf-8');
  const actualHash = sha256(legacyBuf);
  const shaGateOk = actualHash === expectedHash;
  if (!shaGateOk) {
    problems.push(`SHA GATE: esperado ${expectedHash}, real ${actualHash}`);
  }

  let fresh = null;
  try {
    fresh = extractContent(legacyHtml);
  } catch (err) {
    problems.push(`No se pudo re-extraer desde legacy para comparar equivalencia: ${err.message}`);
  }

  const committed = {
    STUDYBANK: readJson(path.join(DATA_DIR, 'study_bank.json')),
    QUIZBANK: readJson(path.join(DATA_DIR, 'quiz_bank.json')),
    FLASHCARDS: readJson(path.join(DATA_DIR, 'flashcards.json')),
  };

  let equivalenceOk = false;
  let firstMismatch = null;
  if (fresh) {
    const equivStudy = deepEqual(fresh.STUDYBANK, committed.STUDYBANK);
    const equivQuiz = deepEqual(fresh.QUIZBANK, committed.QUIZBANK);
    const equivFc = deepEqual(fresh.FLASHCARDS, committed.FLASHCARDS);
    equivalenceOk = equivStudy && equivQuiz && equivFc;
    if (!equivalenceOk) {
      problems.push('CONTENT EQUIVALENCE: src/data/*.json difiere de una re-extracción fresca de legacy.');
      firstMismatch = findFirstEquivalenceMismatch(fresh, committed);
    }
  }

  const { report, problems: structuralProblems, ok: structuralOk } = validateContent(committed, {
    baseline: integrity.baseline,
    nonRegressionFloor: integrity.nonRegressionFloor,
  });
  problems.push(...structuralProblems);

  const overallOk = shaGateOk && equivalenceOk && structuralOk;

  // ---- salida legible -------------------------------------------------
  console.log('SOURCE SHA-256');
  console.log(actualHash);
  console.log('SHA GATE');
  console.log(shaGateOk ? 'PASS' : 'FAIL');
  console.log('STUDY TOPICS');
  console.log(report.studyTopics);
  console.log('QUIZ BANKS');
  console.log(report.quizBanks);
  console.log('QUESTIONS');
  console.log(report.questions);
  console.log('FLASHCARDS');
  console.log(report.flashcards);
  console.log('GENERATED QUESTION IDS');
  console.log(report.generatedQuestionIds);
  console.log('UNIQUE QUESTION IDS');
  console.log(report.uniqueQuestionIds);
  console.log('DUPLICATE STUDY IDS');
  console.log(report.duplicateStudyIds);
  console.log('DUPLICATE QUIZ BANK IDS');
  console.log(report.duplicateQuizBankIds);
  console.log('DUPLICATE QUESTION NUMBERS');
  console.log(report.duplicateQuestionNumbers);
  console.log('DUPLICATE QUESTION IDS');
  console.log(report.duplicateQuestionIds);
  console.log('DUPLICATE FLASHCARD IDS');
  console.log(report.duplicateFlashcardIds);
  console.log('ORPHAN QUESTIONS');
  console.log(report.orphanQuestions);
  console.log('ORPHAN FLASHCARDS');
  console.log(report.orphanFlashcards);
  console.log('INVALID ANSWERS');
  console.log(report.invalidAnswers);
  console.log('MISSING OPTIONS');
  console.log(report.missingOptions);
  console.log('BLANK STEMS');
  console.log(report.blankStems);
  console.log('BLANK OPTIONS');
  console.log(report.blankOptions);
  console.log('EMPTY TOPICS');
  console.log(report.emptyTopics);
  console.log('QUESTION NUMBER SEQUENCES');
  console.log(report.questionNumberSequences ? 'PASS' : 'FAIL');
  console.log('STUDY/QUIZ TOPIC SET');
  console.log(report.topicSetEquivalence ? 'PASS' : 'FAIL');
  console.log('TOPIC ORDER');
  console.log(report.topicOrderConsistent ? 'PASS' : 'FAIL');
  console.log('BLOCK CONSISTENCY');
  console.log(report.blockConsistency ? 'PASS' : 'FAIL');
  console.log('NON-REGRESSION FLOOR');
  console.log(report.nonRegressionFloorOk ? 'PASS' : 'FAIL');
  console.log('CONTENT EQUIVALENCE');
  console.log(equivalenceOk ? 'PASS' : 'FAIL');

  if (!equivalenceOk && firstMismatch) {
    console.log('');
    console.log('CONTENT EQUIVALENCE FAIL');
    console.log('Record:');
    console.log(firstMismatch.record);
    console.log('Field:');
    console.log(firstMismatch.field);
    console.log('Legacy:');
    console.log(firstMismatch.legacy);
    console.log('Extracted:');
    console.log(firstMismatch.extracted);
  }

  console.log('');
  console.log('OVERALL');
  console.log(overallOk ? 'PASS' : 'FAIL');

  if (!overallOk) {
    console.log('');
    console.log('ERRORS:');
    for (const p of problems) console.log(`  - ${p}`);
  }

  process.exit(overallOk ? 0 : 1);
}

main();
