// scripts/lib/validate.mjs
//
// Validación estructural pura del contenido ya parseado (STUDYBANK,
// QUIZBANK, FLASHCARDS). No toca el sistema de ficheros ni conoce nada de
// legacy/CONTENT_INTEGRITY.json — eso es responsabilidad de quien la llama
// (extract-content.mjs para decidir si promociona, verify-content.mjs para
// el chequeo standalone, y los tests para probar reglas concretas con
// fixtures pequeños en memoria, sin tocar el dataset real de 500 preguntas).
//
// Devuelve { report, problems, ok }. `report` son los números/estados para
// imprimir; `problems` son mensajes accionables, cada uno señalando un ID
// concreto cuando aplica (ej. "II-T03-Q014 has blank option \"c\"").

// Import de la implementación JS pura (no ids.ts): así este script funciona
// en cualquier Node con soporte ESM, sin depender de type-stripping nativo
// de TypeScript ni de tooling adicional. Ver
// docs/adr/0003-node-tooling-portability.md.
import { buildQuestionId } from '../../src/data/ids.impl.mjs';

const KNOWN_BLOQUES = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const VALID_ANSWERS = new Set(['a', 'b', 'c', 'd']);

function isBlank(s) {
  return typeof s !== 'string' || s.trim().length === 0;
}

/**
 * @param {{STUDYBANK: any[], QUIZBANK: any[], FLASHCARDS: any[]}} content
 * @param {{
 *   baseline?: {studyTopics?: number, quizBanks?: number, questions?: number, flashcards?: number},
 *   nonRegressionFloor?: {studyTopics?: number, quizBanks?: number, questions?: number, flashcards?: number}
 * }} [limits]
 */
export function validateContent({ STUDYBANK, QUIZBANK, FLASHCARDS }, limits = {}) {
  const { baseline = {}, nonRegressionFloor = {} } = limits;
  const problems = [];
  const report = {};

  // ---- conteos base ---------------------------------------------------
  const totalQuestions = QUIZBANK.reduce((acc, qb) => acc + (qb.questions?.length ?? 0), 0);
  report.studyTopics = STUDYBANK.length;
  report.quizBanks = QUIZBANK.length;
  report.questions = totalQuestions;
  report.flashcards = FLASHCARDS.length;

  // Baseline: la versión ACTUAL debe coincidir exactamente. Esto es lo que
  // detecta una extracción incompleta o un contenido creciendo/menguando
  // sin que nadie lo haya decidido explícitamente.
  if (baseline.studyTopics !== undefined && report.studyTopics !== baseline.studyTopics) {
    problems.push(`STUDY TOPICS: esperado ${baseline.studyTopics}, real ${report.studyTopics}`);
  }
  if (baseline.quizBanks !== undefined && report.quizBanks !== baseline.quizBanks) {
    problems.push(`QUIZ BANKS: esperado ${baseline.quizBanks}, real ${report.quizBanks}`);
  }
  if (baseline.questions !== undefined && report.questions !== baseline.questions) {
    problems.push(`QUESTIONS: esperado ${baseline.questions}, real ${report.questions}`);
  }
  if (baseline.flashcards !== undefined && report.flashcards !== baseline.flashcards) {
    problems.push(`FLASHCARDS: esperado ${baseline.flashcards}, real ${report.flashcards}`);
  }

  // Non-regression floor: comprobación INDEPENDIENTE del baseline. Protege
  // contra el caso "alguien actualiza baseline a la baja (a propósito o por
  // error) y el contenido real también bajó, así que baseline === actual
  // pasa" — el floor no se mueve solo porque baseline se mueva, así que
  // sigue fallando aunque el baseline mienta.
  const floorChecks = [
    ['studyTopics', 'STUDY TOPICS'],
    ['quizBanks', 'QUIZ BANKS'],
    ['questions', 'QUESTIONS'],
    ['flashcards', 'FLASHCARDS'],
  ];
  report.nonRegressionFloorOk = true;
  for (const [key, label] of floorChecks) {
    const floorValue = nonRegressionFloor[key];
    if (floorValue !== undefined && report[key] < floorValue) {
      report.nonRegressionFloorOk = false;
      problems.push(`NON-REGRESSION FLOOR: ${label} real (${report[key]}) < floor histórico protegido (${floorValue})`);
    }
  }

  // ---- ids de tema: formato, duplicados, y set STUDYBANK vs QUIZBANK ----
  const studyIds = STUDYBANK.map((s) => s.id);
  const studyIdSet = new Set(studyIds);
  report.duplicateStudyIds = studyIds.length - studyIdSet.size;
  if (report.duplicateStudyIds !== 0) {
    problems.push(`${report.duplicateStudyIds} id(s) de tema duplicados en STUDYBANK`);
  }

  const quizIds = QUIZBANK.map((q) => q.id);
  const quizIdSet = new Set(quizIds);
  report.duplicateQuizBankIds = quizIds.length - quizIdSet.size;
  if (report.duplicateQuizBankIds !== 0) {
    problems.push(`${report.duplicateQuizBankIds} id(s) de banco de test duplicados en QUIZBANK`);
  }

  for (const s of STUDYBANK) {
    if (s.id !== `${s.bloque}-${s.tema}`) {
      problems.push(`STUDYBANK: id "${s.id}" no coincide con bloque/tema ("${s.bloque}-${s.tema}")`);
    }
  }
  for (const q of QUIZBANK) {
    if (q.id !== `${q.bloque}-${q.tema}`) {
      problems.push(`QUIZBANK: id "${q.id}" no coincide con bloque/tema ("${q.bloque}-${q.tema}")`);
    }
  }

  const onlyInStudy = [...studyIdSet].filter((id) => !quizIdSet.has(id));
  const onlyInQuiz = [...quizIdSet].filter((id) => !studyIdSet.has(id));
  report.orphanQuestions = onlyInQuiz.length; // bancos de test sin tema de estudio
  report.topicSetEquivalence = onlyInStudy.length === 0 && onlyInQuiz.length === 0;
  if (onlyInQuiz.length > 0) {
    problems.push(`ORPHAN QUESTIONS: banco(s) de test sin tema de estudio: ${onlyInQuiz.join(', ')}`);
  }
  if (onlyInStudy.length > 0) {
    problems.push(`Tema(s) de estudio sin banco de test asociado: ${onlyInStudy.join(', ')}`);
  }

  // orden: STUDYBANK y QUIZBANK deben listar los temas en el mismo orden
  // (no reordenar el temario silenciosamente al migrar).
  const minLen = Math.min(studyIds.length, quizIds.length);
  let orderMismatchAt = -1;
  for (let i = 0; i < minLen; i++) {
    if (studyIds[i] !== quizIds[i]) {
      orderMismatchAt = i;
      break;
    }
  }
  report.topicOrderConsistent = orderMismatchAt === -1 && studyIds.length === quizIds.length;
  if (!report.topicOrderConsistent && orderMismatchAt !== -1) {
    problems.push(
      `TOPIC ORDER: STUDYBANK y QUIZBANK divergen en la posición ${orderMismatchAt} (${studyIds[orderMismatchAt]} vs ${quizIds[orderMismatchAt]})`
    );
  }

  // ---- bloques conocidos --------------------------------------------------
  let blockProblems = 0;
  for (const s of STUDYBANK) {
    if (!KNOWN_BLOQUES.includes(s.bloque)) {
      blockProblems++;
      problems.push(`${s.id}: bloque desconocido "${s.bloque}"`);
    }
  }
  for (const q of QUIZBANK) {
    if (!KNOWN_BLOQUES.includes(q.bloque)) {
      blockProblems++;
      problems.push(`${q.id}: bloque desconocido "${q.bloque}"`);
    }
  }
  for (const f of FLASHCARDS) {
    if (!KNOWN_BLOQUES.includes(f.bloque)) {
      blockProblems++;
      problems.push(`${f.id}: bloque desconocido "${f.bloque}"`);
    }
  }
  report.blockConsistency = blockProblems === 0;

  // ---- contenido de estudio ------------------------------------------------
  const emptyTopics = [];
  for (const s of STUDYBANK) {
    if (isBlank(s.id)) problems.push(`STUDYBANK: entrada con id vacío (title="${s.title ?? ''}")`);
    if (isBlank(s.title)) problems.push(`${s.id}: title vacío`);
    if (isBlank(s.markdown)) {
      emptyTopics.push(s.id);
      problems.push(`${s.id}: markdown vacío`);
    }
  }
  report.emptyTopics = emptyTopics.length;

  // ---- preguntas: números, contenido, respuestas ---------------------------
  let duplicateQuestionNumbers = 0;
  let invalidAnswers = 0;
  let missingOptions = 0;
  let blankStems = 0;
  let blankOptions = 0;
  let sequenceOk = true;
  const questionsPerTopic = {};

  for (const qb of QUIZBANK) {
    const nums = qb.questions.map((q) => q.num);
    questionsPerTopic[qb.id] = qb.questions.length;

    const seen = new Set();
    for (const n of nums) {
      if (seen.has(n)) {
        duplicateQuestionNumbers++;
        problems.push(`${qb.id}: número de pregunta duplicado (${n})`);
      }
      seen.add(n);
      if (!Number.isInteger(n) || n < 1) {
        problems.push(`${qb.id}: número de pregunta inválido (${JSON.stringify(n)})`);
      }
    }

    const sorted = [...seen].sort((a, b) => a - b);
    const expectedSeq = sorted.map((_, i) => i + 1);
    const isSequential = sorted.length === nums.length /* sin duplicados */
      && JSON.stringify(sorted) === JSON.stringify(expectedSeq);
    if (!isSequential) {
      sequenceOk = false;
      problems.push(`${qb.id}: numeración de preguntas no es secuencial 1..N sin huecos (vistos: ${sorted.join(',')})`);
    }

    for (const q of qb.questions) {
      const qref = `${qb.id}#${q.num}`;
      if (isBlank(q.stem)) {
        blankStems++;
        problems.push(`${qref}: stem en blanco`);
      }
      if (!Array.isArray(q.opts) || q.opts.length !== 4) {
        missingOptions++;
        problems.push(`${qref}: no tiene exactamente 4 opciones (tiene ${Array.isArray(q.opts) ? q.opts.length : 'no-array'})`);
      } else {
        q.opts.forEach((opt, idx) => {
          if (isBlank(opt)) {
            blankOptions++;
            const letter = 'abcd'[idx];
            problems.push(`${qref} has blank option "${letter}"`);
          }
        });
      }
      if (!VALID_ANSWERS.has(q.answer)) {
        invalidAnswers++;
        problems.push(`${qref}: clave de respuesta inválida "${q.answer}"`);
      }
    }
  }

  report.duplicateQuestionNumbers = duplicateQuestionNumbers;
  report.invalidAnswers = invalidAnswers;
  report.missingOptions = missingOptions;
  report.blankStems = blankStems;
  report.blankOptions = blankOptions;
  report.questionNumberSequences = sequenceOk;
  report.questionsPerTopic = questionsPerTopic;

  // ---- QuestionId global: generación + unicidad -----------------------------
  const generatedIds = [];
  let idBuildErrors = 0;
  for (const qb of QUIZBANK) {
    for (const q of qb.questions) {
      try {
        generatedIds.push(buildQuestionId(qb.id, q.num));
      } catch (err) {
        idBuildErrors++;
        problems.push(`${qb.id}#${q.num}: no se pudo construir QuestionId (${err.message})`);
      }
    }
  }
  const uniqueIds = new Set(generatedIds);
  report.generatedQuestionIds = generatedIds.length;
  report.uniqueQuestionIds = uniqueIds.size;
  report.duplicateQuestionIds = generatedIds.length - uniqueIds.size;
  if (idBuildErrors === 0 && report.duplicateQuestionIds !== 0) {
    problems.push(`${report.duplicateQuestionIds} QuestionId duplicado(s) tras generarlos para todas las preguntas`);
  }

  // ---- flashcards -----------------------------------------------------------
  const fcIds = FLASHCARDS.map((f) => f.id);
  const fcIdSet = new Set(fcIds);
  report.duplicateFlashcardIds = fcIds.length - fcIdSet.size;
  if (report.duplicateFlashcardIds !== 0) {
    problems.push(`${report.duplicateFlashcardIds} id(s) de flashcard duplicados`);
  }
  const orphanFlashcards = FLASHCARDS.filter((f) => !studyIdSet.has(f.id_tema));
  report.orphanFlashcards = orphanFlashcards.length;
  if (report.orphanFlashcards !== 0) {
    problems.push(`ORPHAN FLASHCARDS: ${orphanFlashcards.map((f) => f.id).join(', ')} referencian id_tema inexistente`);
  }
  for (const f of FLASHCARDS) {
    if (isBlank(f.front)) problems.push(`${f.id}: front en blanco`);
    if (isBlank(f.back)) problems.push(`${f.id}: back en blanco`);
  }

  return { report, problems, ok: problems.length === 0 };
}
