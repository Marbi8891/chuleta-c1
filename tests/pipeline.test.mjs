// tests/pipeline.test.mjs
//
// Tests de caja negra sobre el CLI real (extract-content.mjs / verify-content.mjs)
// contra una raíz de proyecto aislada y temporal (CHULETA_TEST_ROOT), usando
// el fixture pequeño de tests/helpers/fixture.mjs — nunca el dataset real.
//
// Cubre:
//   TEST 1  — fuente válida: la extracción tiene éxito.
//   TEST 2  — fuente legacy modificada (SHA no coincide): la extracción
//             falla, exit code != 0, y NO se escribe ningún fichero.
//   TEST 3  — protección de escritura parcial (fallo de validación ANTES de
//             promocionar): un legacy cuyo SHA coincide pero cuyo contenido
//             no pasa la validación estructural no debe poder sobreescribir
//             un src/data/ bueno ya existente.
//   TEST 3B — rollback transaccional (fallo DURANTE la promoción, después
//             de haber promocionado ya al menos un fichero): usa fault
//             injection (CHULETA_TEST_FAIL_PROMOTION_AFTER) para forzar el
//             fallo tras el primer rename, y demuestra que los TRES
//             ficheros quedan exactamente como antes.
//   TEST OWNERSHIP — cleanTmp() solo borra su propio workspace
//             (.tmp/content-extraction/), nunca temporales de otro proceso
//             que compartan .tmp/.
//   TEST EQUIVALENCE NEGATIVE — legacy intacto, src/data alterado a mano:
//             verify-content debe fallar por CONTENT EQUIVALENCE (no por
//             una regla estructural), tanto para un stem alterado como
//             para una respuesta cambiada de una clave válida a otra
//             clave válida (b -> c), demostrando que equivalence protege
//             CONTENIDO, no solo estructura.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildFixtureHtml } from './helpers/fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXTRACT_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'extract-content.mjs');
const VERIFY_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'verify-content.mjs');

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function makeTestRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'chuleta-fixture-'));
  mkdirSync(path.join(root, 'legacy'), { recursive: true });
  return root;
}

function writeLegacyAndIntegrity(root, fixture) {
  writeFileSync(path.join(root, 'legacy', 'index.original.html'), fixture.html, 'utf-8');
  writeFileSync(
    path.join(root, 'CONTENT_INTEGRITY.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        legacySource: { path: 'legacy/index.original.html', sha256: fixture.sha256 },
        academicStatus: 'EXPERT_AUDITED',
        baseline: fixture.baseline,
        nonRegressionFloor: fixture.baseline,
      },
      null,
      2
    ),
    'utf-8'
  );
}

function runExtract(root, extraEnv = {}) {
  return spawnSync(process.execPath, [EXTRACT_SCRIPT], {
    env: { ...process.env, CHULETA_TEST_ROOT: root, ...extraEnv },
    encoding: 'utf-8',
  });
}

function runVerify(root) {
  return spawnSync(process.execPath, [VERIFY_SCRIPT], {
    env: { ...process.env, CHULETA_TEST_ROOT: root },
    encoding: 'utf-8',
  });
}

function dataFileHashes(root) {
  const dataDir = path.join(root, 'src', 'data');
  return {
    study: sha256File(path.join(dataDir, 'study_bank.json')),
    quiz: sha256File(path.join(dataDir, 'quiz_bank.json')),
    flashcards: sha256File(path.join(dataDir, 'flashcards.json')),
  };
}

test('TEST 1 — fuente válida: la extracción tiene éxito', () => {
  const root = makeTestRoot();
  const fixture = buildFixtureHtml();
  writeLegacyAndIntegrity(root, fixture);

  const result = runExtract(root);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  const dataDir = path.join(root, 'src', 'data');
  assert.ok(existsSync(path.join(dataDir, 'study_bank.json')));
  assert.ok(existsSync(path.join(dataDir, 'quiz_bank.json')));
  assert.ok(existsSync(path.join(dataDir, 'flashcards.json')));

  const quiz = JSON.parse(readFileSync(path.join(dataDir, 'quiz_bank.json'), 'utf-8'));
  const totalQuestions = quiz.reduce((a, qb) => a + qb.questions.length, 0);
  assert.equal(totalQuestions, 6);

  rmSync(root, { recursive: true, force: true });
});

test('TEST 2 — legacy modificado (SHA no coincide): falla y no escribe nada', () => {
  const root = makeTestRoot();
  const original = buildFixtureHtml();
  // CONTENT_INTEGRITY.json apunta al hash del ORIGINAL...
  writeLegacyAndIntegrity(root, original);
  // ...pero el legacy en disco ha sido modificado después (tweakStem),
  // así que su SHA real ya no coincide con el registrado.
  const tweaked = buildFixtureHtml({ tweakStem: true });
  writeFileSync(path.join(root, 'legacy', 'index.original.html'), tweaked.html, 'utf-8');

  const dataDir = path.join(root, 'src', 'data');
  assert.ok(!existsSync(dataDir), 'precondición: src/data no debe existir todavía');

  const result = runExtract(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch/);
  assert.ok(!existsSync(dataDir), 'src/data no debe haberse creado tras un SHA gate fallido');

  rmSync(root, { recursive: true, force: true });
});

test('TEST 3 — protección de escritura parcial (fallo de validación previo a promoción): no sobreescribe datos buenos', () => {
  const root = makeTestRoot();

  // 1) Primera extracción, válida — establece un src/data "bueno".
  const good = buildFixtureHtml();
  writeLegacyAndIntegrity(root, good);
  const firstRun = runExtract(root);
  assert.equal(firstRun.status, 0, `stderr: ${firstRun.stderr}`);

  const hashesBefore = dataFileHashes(root);

  // 2) Sustituir legacy + CONTENT_INTEGRITY.json por una versión cuyo SHA
  //    SÍ coincide (porque recalculamos el hash del propio contenido roto),
  //    pero cuyo contenido rompe la validación estructural (answer inválida).
  const broken = buildFixtureHtml({ breakAnswer: true });
  writeLegacyAndIntegrity(root, broken);

  const secondRun = runExtract(root);
  assert.notEqual(secondRun.status, 0, 'la extracción con contenido inválido debe fallar');
  assert.match(secondRun.stderr, /src\/data\/ NO ha sido modificado/);

  const hashesAfter = dataFileHashes(root);
  assert.deepEqual(hashesAfter, hashesBefore, 'src/data debe permanecer byte-a-byte idéntico tras un intento de extracción inválida');

  // El workspace propio del extractor no debe quedar residual tras el fallo.
  assert.ok(!existsSync(path.join(root, '.tmp', 'content-extraction')), '.tmp/content-extraction debe limpiarse tras un fallo de validación');
  // Tampoco deben quedar ficheros de staging/backup sueltos en src/data/.
  const dataDirEntries = readdirSync(path.join(root, 'src', 'data'));
  assert.ok(!dataDirEntries.some((f) => f.endsWith('.promoting') || f.endsWith('.backup')), `no debe haber ficheros .promoting/.backup residuales: ${dataDirEntries}`);

  rmSync(root, { recursive: true, force: true });
});

test('TEST 3B — rollback transaccional: fallo DURANTE la promoción (tras 1 fichero ya promocionado) restaura los tres', () => {
  const root = makeTestRoot();

  // 1) Extracción válida inicial — src/data "bueno" de referencia.
  const good = buildFixtureHtml();
  writeLegacyAndIntegrity(root, good);
  const firstRun = runExtract(root);
  assert.equal(firstRun.status, 0, `stderr: ${firstRun.stderr}`);
  const hashesBefore = dataFileHashes(root);

  // 2) Segunda extracción, contenido válido pero DISTINTO (para que, si el
  //    rollback fallara, se notaría un cambio real en el hash) — y fault
  //    injection forzando el fallo justo después de promocionar el primer
  //    fichero (study_bank.json), con quiz_bank.json y flashcards.json
  //    todavía por promocionar.
  const changedButValid = buildFixtureHtml(); // mismo contenido determinista; ver nota abajo
  // Aseguramos que el "nuevo" contenido sería realmente distinto del actual
  // si llegara a promocionarse completo, cambiando un stem válido (no
  // rompe ninguna regla estructural, así que la validación previa pasa y
  // el fallo solo puede venir de la fault injection en la promoción).
  changedButValid.html = changedButValid.html.replace('Pregunta 1 de I-T01', 'Pregunta 1 de I-T01 (version 2)');
  changedButValid.sha256 = createHash('sha256').update(changedButValid.html, 'utf-8').digest('hex');
  writeLegacyAndIntegrity(root, changedButValid);

  const result = runExtract(root, { CHULETA_TEST_FAIL_PROMOTION_AFTER: '1' });
  assert.notEqual(result.status, 0, 'la promoción con fallo inyectado debe fallar');
  assert.match(result.stderr, /Rollback ejecutado/);

  const hashesAfter = dataFileHashes(root);
  assert.deepEqual(
    hashesAfter,
    hashesBefore,
    'tras un fallo a mitad de promoción, los TRES ficheros deben quedar exactamente como estaban (rollback completo), no una mezcla de viejo y nuevo'
  );

  // Ni residuos de staging/backup ni del workspace temporal.
  const dataDirEntries = readdirSync(path.join(root, 'src', 'data'));
  assert.ok(!dataDirEntries.some((f) => f.endsWith('.promoting') || f.endsWith('.backup')), `no debe haber ficheros .promoting/.backup residuales tras el rollback: ${dataDirEntries}`);
  assert.ok(!existsSync(path.join(root, '.tmp', 'content-extraction')));

  rmSync(root, { recursive: true, force: true });
});

test('TEST STAGING FAILURE — fallo durante la fase de staging (antes de tocar ningún canónico): src/data intacto, cero residuos, y NO se declara "rollback"', () => {
  const root = makeTestRoot();

  // 1) Extracción válida inicial — src/data "bueno" de referencia.
  const good = buildFixtureHtml();
  writeLegacyAndIntegrity(root, good);
  const firstRun = runExtract(root);
  assert.equal(firstRun.status, 0, `stderr: ${firstRun.stderr}`);
  const hashesBefore = dataFileHashes(root);

  // 2) Segunda extracción con contenido válido (la validación estructural
  //    pasaría perfectamente) pero con fault injection forzando el fallo
  //    DURANTE el staging, tras preparar 1 de los 3 ficheros — es decir,
  //    antes de que exista ningún .backup y antes de tocar cualquier
  //    fichero canónico.
  const changed = buildFixtureHtml();
  changed.html = changed.html.replace('Pregunta 1 de I-T01', 'Pregunta 1 de I-T01 (staging test)');
  changed.sha256 = createHash('sha256').update(changed.html, 'utf-8').digest('hex');
  writeLegacyAndIntegrity(root, changed);

  const result = runExtract(root, { CHULETA_TEST_FAIL_STAGING_AFTER: '1' });
  assert.notEqual(result.status, 0, 'el fallo inyectado en staging debe hacer fallar la extracción');

  // No debe hablar de "rollback": el commit ni siquiera había empezado.
  assert.match(result.stderr, /fallo preparando la promoción \(fase: staging\)/);
  assert.doesNotMatch(result.stderr, /Rollback ejecutado/);

  const hashesAfter = dataFileHashes(root);
  assert.deepEqual(hashesAfter, hashesBefore, 'src/data debe permanecer byte-a-byte idéntico tras un fallo en staging');

  const dataDirEntries = readdirSync(path.join(root, 'src', 'data'));
  assert.ok(!dataDirEntries.some((f) => f.endsWith('.promoting') || f.endsWith('.backup')), `no debe haber ficheros .promoting/.backup residuales tras un fallo en staging: ${dataDirEntries}`);
  assert.ok(!existsSync(path.join(root, '.tmp', 'content-extraction')));

  rmSync(root, { recursive: true, force: true });
});

test('TEST OWNERSHIP — cleanTmp solo borra .tmp/content-extraction, nunca temporales ajenos en .tmp/', () => {
  const root = makeTestRoot();
  const fixture = buildFixtureHtml();
  writeLegacyAndIntegrity(root, fixture);

  // Simula un temporal de OTRO proceso conviviendo en .tmp/.
  const foreignDir = path.join(root, '.tmp', 'otro-proceso');
  mkdirSync(foreignDir, { recursive: true });
  const foreignFile = path.join(foreignDir, 'no-tocar.txt');
  writeFileSync(foreignFile, 'contenido de otro proceso, no debe borrarse', 'utf-8');

  const result = runExtract(root);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);

  assert.ok(existsSync(foreignFile), 'un temporal de otro proceso en .tmp/ no debe ser borrado por cleanTmp()');
  assert.equal(readFileSync(foreignFile, 'utf-8'), 'contenido de otro proceso, no debe borrarse');
  assert.ok(!existsSync(path.join(root, '.tmp', 'content-extraction')), 'el workspace propio del extractor sí debe haberse limpiado tras el éxito');

  rmSync(root, { recursive: true, force: true });
});

test('TEST EQUIVALENCE NEGATIVE (stem) — legacy intacto, stem alterado en src/data: CONTENT EQUIVALENCE FAIL', () => {
  const root = makeTestRoot();
  const fixture = buildFixtureHtml();
  writeLegacyAndIntegrity(root, fixture);
  const extractResult = runExtract(root);
  assert.equal(extractResult.status, 0, `stderr: ${extractResult.stderr}`);

  // legacy NO se toca. Alteramos a mano el stem ya comprometido por otro
  // texto igualmente válido (no vacío, no rompe ninguna regla estructural).
  const quizPath = path.join(root, 'src', 'data', 'quiz_bank.json');
  const quiz = JSON.parse(readFileSync(quizPath, 'utf-8'));
  quiz[0].questions[0].stem = 'Un enunciado distinto, perfectamente válido en forma';
  writeFileSync(quizPath, JSON.stringify(quiz, null, 2) + '\n', 'utf-8');

  const verifyResult = runVerify(root);
  assert.notEqual(verifyResult.status, 0);
  assert.match(verifyResult.stdout, /CONTENT EQUIVALENCE\nFAIL/);
  assert.match(verifyResult.stdout, /Field:\nstem/);
  assert.match(verifyResult.stdout, /I-T01-Q001/);

  rmSync(root, { recursive: true, force: true });
});

test('TEST EQUIVALENCE NEGATIVE (answer) — respuesta cambiada de una clave válida a otra clave válida: CONTENT EQUIVALENCE FAIL', () => {
  const root = makeTestRoot();
  const fixture = buildFixtureHtml();
  writeLegacyAndIntegrity(root, fixture);
  const extractResult = runExtract(root);
  assert.equal(extractResult.status, 0, `stderr: ${extractResult.stderr}`);

  const quizPath = path.join(root, 'src', 'data', 'quiz_bank.json');
  const quiz = JSON.parse(readFileSync(quizPath, 'utf-8'));
  const original = quiz[0].questions[0].answer; // 'a' en el fixture
  assert.notEqual(original, 'c');
  quiz[0].questions[0].answer = 'c'; // sigue siendo una clave VÁLIDA (a/b/c/d)
  writeFileSync(quizPath, JSON.stringify(quiz, null, 2) + '\n', 'utf-8');

  const verifyResult = runVerify(root);
  assert.notEqual(verifyResult.status, 0);
  // No debe colarse como si fuera solo un problema estructural de
  // "invalid answer" (c es válida) — debe fallar específicamente por
  // equivalencia de contenido.
  assert.match(verifyResult.stdout, /CONTENT EQUIVALENCE\nFAIL/);
  assert.match(verifyResult.stdout, /Field:\nanswer/);
  assert.match(verifyResult.stdout, new RegExp(`Legacy:\\n${original}`));
  assert.match(verifyResult.stdout, /Extracted:\nc/);
  assert.match(verifyResult.stdout, /INVALID ANSWERS\n0/, 'la respuesta "c" es válida en forma: esto NO debe aparecer como invalid-answer, solo como equivalence');

  rmSync(root, { recursive: true, force: true });
});
