#!/usr/bin/env node
// scripts/extract-content.mjs
//
// Fase 1.5B (microcorrección post-auditoría) — extracción con SHA gate
// obligatorio y promoción TRANSACCIONAL con rollback, ahora con cleanup
// robusto en las TRES fases (staging, backup, commit), no solo en el
// commit.
//
// Flujo (ver docs/DATA_INTEGRITY.md para el diagrama completo):
//
//   legacy source -> SHA check -> parse -> temp files -> validación
//     -> ¿todo OK? -> NO: abortar, borrar temp, src/data intacto
//                  -> SI: promoción transaccional
//                          (stage -> backup -> commit, cada fase con su
//                           propio cleanup si falla) -> src/data
//
// Reglas duras:
//   - Si el SHA-256 del legacy no coincide con CONTENT_INTEGRITY.json, no se
//     escribe NADA — ni siquiera el directorio temporal.
//   - Si el parseo o la validación estructural fallan, se borra el
//     directorio temporal propio del extractor y src/data/ queda
//     exactamente como estaba.
//   - Si falla la preparación (staging o backup, ANTES de tocar ningún
//     fichero canónico), se limpian los .promoting/.backup que se hubieran
//     llegado a crear y se informa de un fallo de PREPARACIÓN — nunca se
//     dice "rollback ejecutado", porque no ha habido nada que deshacer:
//     src/data no se tocó en ningún momento.
//   - Si falla el COMMIT (a mitad de los renames), sí hay rollback real:
//     se restauran los ficheros ya sobrescritos desde su backup, y se
//     limpian todos los .promoting/.backup, dejando los TRES ficheros
//     exactamente como estaban antes de empezar.

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractContent } from './lib/extract.mjs';
import { validateContent } from './lib/validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CHULETA_TEST_ROOT
  ? path.resolve(process.env.CHULETA_TEST_ROOT)
  : path.resolve(__dirname, '..');

const LEGACY_PATH = path.join(ROOT, 'legacy', 'index.original.html');
const INTEGRITY_PATH = path.join(ROOT, 'CONTENT_INTEGRITY.json');
const DATA_DIR = path.join(ROOT, 'src', 'data');

// Workspace PROPIO del extractor. cleanOwnTmp() borra solo esto — nunca todo
// ROOT/.tmp/, que puede contener temporales de otros procesos.
const OWN_TMP_DIR = path.join(ROOT, '.tmp', 'content-extraction');

const FILES = {
  STUDYBANK: 'study_bank.json',
  QUIZBANK: 'quiz_bank.json',
  FLASHCARDS: 'flashcards.json',
};
const FILENAMES = Object.values(FILES);

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function cleanOwnTmp() {
  rmSync(OWN_TMP_DIR, { recursive: true, force: true });
}

/** Barrido incondicional de *.promoting / *.backup en DATA_DIR. Nunca toca
 * el nombre final (canónico) de un fichero — solo sus posibles residuos de
 * transacción. Seguro de llamar aunque los ficheros no existan. */
function sweepTransactionArtifacts() {
  for (const filename of FILENAMES) {
    rmSync(path.join(DATA_DIR, `${filename}.promoting`), { force: true });
    rmSync(path.join(DATA_DIR, `${filename}.backup`), { force: true });
  }
}

/** Error de promoción que recuerda en qué fase ocurrió, para no informar
 * de un "rollback" cuando en realidad el commit ni siquiera había
 * empezado (fases 'staging' y 'backup' son solo preparación). */
class PromotionError extends Error {
  constructor(phase, cause) {
    super(`[${phase}] ${cause.message}`);
    this.phase = phase; // 'staging' | 'backup' | 'commit'
    this.cause = cause;
  }
}

/**
 * Puntos de inyección de fallos SOLO para tests. Inertes en ejecución
 * normal: ningún script de package.json define estas variables. Permiten a
 * los tests forzar un fallo en una fase concreta de la promoción.
 */
function maybeInjectFault(envVar, afterCount) {
  const raw = process.env[envVar];
  if (raw !== undefined && Number(raw) === afterCount) {
    throw new Error(`FAULT INJECTION (test-only): [${envVar}=${raw}] fallo forzado tras ${afterCount} elemento(s)`);
  }
}

/**
 * Promoción transaccional de OWN_TMP_DIR -> DATA_DIR para los tres
 * ficheros de contenido, en tres fases con cleanup propio cada una.
 * Lanza PromotionError con la fase en la que falló.
 */
function promoteTransactionally() {
  mkdirSync(DATA_DIR, { recursive: true });

  const stagingPaths = {};
  const backupPaths = {};
  const committed = [];

  // ---- Fase 1: preparar staging de TODOS los ficheros nuevos -------------
  // Todavía no se ha tocado ningún fichero canónico: un fallo aquí NO es
  // un rollback, es simplemente "no se llegó a empezar".
  try {
    let staged = 0;
    for (const filename of FILENAMES) {
      const src = path.join(OWN_TMP_DIR, filename);
      const staging = path.join(DATA_DIR, `${filename}.promoting`);
      writeFileSync(staging, readFileSync(src));
      stagingPaths[filename] = staging;
      staged++;
      maybeInjectFault('CHULETA_TEST_FAIL_STAGING_AFTER', staged);
    }
  } catch (err) {
    sweepTransactionArtifacts();
    throw new PromotionError('staging', err);
  }

  // ---- Fase 2: respaldar TODO lo que ya existe en DATA_DIR ----------------
  // Tampoco se ha tocado ningún fichero canónico todavía (copyFileSync solo
  // LEE el original y escribe una copia aparte) — un fallo aquí sigue
  // siendo preparación, no rollback.
  try {
    for (const filename of FILENAMES) {
      const finalDest = path.join(DATA_DIR, filename);
      if (existsSync(finalDest)) {
        const backup = path.join(DATA_DIR, `${filename}.backup`);
        copyFileSync(finalDest, backup);
        backupPaths[filename] = backup;
      }
    }
  } catch (err) {
    sweepTransactionArtifacts();
    throw new PromotionError('backup', err);
  }

  // ---- Fase 3: commit — rename staging -> final, uno a uno ----------------
  // A partir de aquí SÍ se modifican ficheros canónicos, así que un fallo
  // en esta fase sí exige rollback real.
  try {
    for (const filename of FILENAMES) {
      const finalDest = path.join(DATA_DIR, filename);
      renameSync(stagingPaths[filename], finalDest); // atómico a nivel de fichero individual
      committed.push(filename);
      maybeInjectFault('CHULETA_TEST_FAIL_PROMOTION_AFTER', committed.length);
    }
  } catch (err) {
    try {
      // ---- ROLLBACK: restaurar exactamente el estado anterior -------------
      for (const filename of FILENAMES) {
        const finalDest = path.join(DATA_DIR, filename);
        if (committed.includes(filename)) {
          if (backupPaths[filename]) {
            renameSync(backupPaths[filename], finalDest); // restaura el contenido anterior
          } else {
            rmSync(finalDest, { force: true }); // no existía antes: no debe existir después
          }
        }
      }
    } finally {
      sweepTransactionArtifacts();
    }
    throw new PromotionError('commit', err);
  }

  // ---- Éxito: ya no hacen falta los backups ------------------------------
  sweepTransactionArtifacts();
}

function main() {
  if (!existsSync(LEGACY_PATH)) {
    console.error(`ERROR: no existe ${LEGACY_PATH}`);
    process.exit(1);
  }
  if (!existsSync(INTEGRITY_PATH)) {
    console.error(`ERROR: no existe ${INTEGRITY_PATH} — no hay baseline contra la que verificar. Extraction aborted.`);
    process.exit(1);
  }

  const integrity = JSON.parse(readFileSync(INTEGRITY_PATH, 'utf-8'));
  const expectedHash = integrity.legacySource?.sha256 ?? integrity.source?.sha256;

  // ---- 1. SHA GATE — antes de leer/parsear/escribir nada más ----------
  const legacyBuf = readFileSync(LEGACY_PATH);
  const actualHash = sha256(legacyBuf);

  if (actualHash !== expectedHash) {
    console.error('ERROR: Legacy source SHA-256 mismatch.');
    console.error('Expected:');
    console.error(`  ${expectedHash}`);
    console.error('Actual:');
    console.error(`  ${actualHash}`);
    console.error('Extraction aborted. No files were modified.');
    process.exitCode = 1;
    return; // no se toca .tmp ni src/data
  }

  console.log(`SHA gate: PASS (${actualHash})`);

  // ---- 2. Parse ----------------------------------------------------------
  const legacyHtml = legacyBuf.toString('utf-8');
  let parsed;
  try {
    parsed = extractContent(legacyHtml);
  } catch (err) {
    console.error(`ERROR: fallo al parsear el contenido del legacy: ${err.message}`);
    console.error('Extraction aborted. No files were modified.');
    process.exitCode = 1;
    return;
  }

  // ---- 3. Escribir al workspace temporal propio (no a src/data todavía) --
  cleanOwnTmp();
  mkdirSync(OWN_TMP_DIR, { recursive: true });
  for (const [key, filename] of Object.entries(FILES)) {
    writeFileSync(path.join(OWN_TMP_DIR, filename), JSON.stringify(parsed[key], null, 2) + '\n', 'utf-8');
  }

  // ---- 4. Validar el contenido temporal, NO el ya comprometido -----------
  const { report, problems, ok } = validateContent(parsed, {
    baseline: integrity.baseline,
    nonRegressionFloor: integrity.nonRegressionFloor,
  });

  if (!ok) {
    console.error('ERROR: validación de contenido falló tras la extracción. src/data/ NO ha sido modificado.');
    console.error('');
    console.error('Problemas detectados:');
    for (const p of problems) console.error(`  - ${p}`);
    cleanOwnTmp();
    process.exitCode = 1;
    return;
  }

  // ---- 5. Promoción transaccional (stage + backup + commit, o rollback) --
  try {
    promoteTransactionally();
  } catch (err) {
    if (err instanceof PromotionError && err.phase !== 'commit') {
      // Preparación (staging/backup) falló ANTES de tocar ningún fichero
      // canónico: no hubo nada que deshacer, así que no se dice "rollback".
      console.error(`ERROR: fallo preparando la promoción (fase: ${err.phase}), antes de tocar ningún fichero canónico. src/data/ intacto, sin cambios.`);
      console.error(`Causa: ${err.cause?.message ?? err.message}`);
    } else {
      console.error('ERROR: fallo durante la promoción. Rollback ejecutado: src/data/ restaurado a su estado anterior.');
      console.error(`Causa: ${err.cause?.message ?? err.message}`);
    }
    cleanOwnTmp();
    process.exitCode = 1;
    return;
  }
  cleanOwnTmp();

  console.log('');
  console.log('Promoción completada (transaccional): src/data/ actualizado.');
  console.log(`  STUDY TOPICS = ${report.studyTopics}`);
  console.log(`  QUIZ BANKS   = ${report.quizBanks}`);
  console.log(`  QUESTIONS    = ${report.questions}`);
  console.log(`  FLASHCARDS   = ${report.flashcards}`);
  console.log('');
  console.log('Ejecuta "npm run verify-content" para el informe completo de integridad.');
}

main();
