// src/db/legacyMigration.ts
//
// Migración única, segura e idempotente de localStorage["chuletaC1_v1"]
// (app legacy / Fase 2) a IndexedDB (Dexie). Ver docs/LEGACY_MIGRATION.md
// para la tabla completa campo a campo y el razonamiento de cada decisión.
//
// LEGACY SOURCE = READ-ONLY: este módulo NUNCA escribe en localStorage ni
// lo borra. Lee `localStorage[STORAGE_KEY]` de forma independiente (no a
// través de src/state/appState.ts, que usa un try/catch silencioso que no
// permite distinguir "no hay nada que migrar" de "hay algo pero está
// corrupto" — distinción que esta migración necesita).

import { getMeta, setMeta } from './appMeta';
import { APP_META_KEYS, LEGACY_MIGRATION_VERSION } from './schema';
import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import { STORAGE_KEY, type AppState, type QuizHistoryEntry } from '../state/appState';
import { getTopicById, getFlashcards } from '../data/index';
import type { TemaId } from '../types/content';

export interface MigrationSummary {
  topicsMigrated: number;
  topicsSkippedOrphan: TemaId[];
  flashcardsMigrated: number;
  flashcardsSkippedOrphan: string[];
  quizSessionsMigrated: number;
  quizHistoryEntriesSkipped: number;
  studyFsIndexMigrated: boolean;
}

export type LegacyMigrationResult =
  | { status: 'already-migrated' }
  | { status: 'no-legacy-data' }
  | { status: 'invalid-legacy-data'; reason: string }
  | { status: 'migrated'; summary: MigrationSummary }
  /**
   * La transacción Dexie falló a mitad (p. ej. IndexedDB quedó sin cuota).
   * Dexie revierte TODA la transacción automáticamente (MIGRATION
   * TRANSACTION en la especificación) — ningún dato queda a medio migrar.
   * legacyMigrationVersion tampoco queda marcada, así que la próxima vez
   * que arranque la app se reintentará desde cero.
   */
  | { status: 'migration-failed'; reason: string };

function readRawLegacyBlob(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage inaccesible (modo privado, cuota, entorno sin storage):
    // no hay forma de saber si había algo que migrar. Tratarlo como "nada
    // que migrar" — igual que el try/catch silencioso que la propia app
    // legacy ya usaba para este mismo caso (appState.ts) — en vez de
    // bloquear la app reintentando para siempre contra un storage que no
    // responde.
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Валidación de forma de alto nivel — SOLO decide si el JSON es utilizable en absoluto. */
function isValidTopLevelShape(value: unknown): value is Partial<AppState> {
  if (!isPlainRecord(value)) return false;
  if ('known' in value && value.known !== undefined && !isPlainRecord(value.known)) return false;
  if ('studied' in value && value.studied !== undefined && !isPlainRecord(value.studied)) return false;
  if ('quizHistory' in value && value.quizHistory !== undefined && !Array.isArray(value.quizHistory)) return false;
  return true;
}

function isValidQuizHistoryEntry(value: unknown): value is QuizHistoryEntry {
  return (
    isPlainRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.total === 'number' &&
    Number.isFinite(value.total) &&
    typeof value.pct === 'number' &&
    Number.isFinite(value.pct)
  );
}

const STUDY_FS_STEPS_LENGTH = 5; // ver src/db/topicProgress.ts — mismo rango que legacy (16/18/20/22/24px).

/**
 * Ejecuta la migración si hace falta (no-op seguro si ya se ejecutó — ver
 * IDEMPOTENCIA en la especificación de Fase 3). Debe llamarse una vez al
 * arrancar la app, antes de leer progreso persistido (ver PersistenceGate).
 */
export async function runLegacyMigration(database: ChuletaC1DB = defaultDb): Promise<LegacyMigrationResult> {
  const currentVersion = await getMeta<number>(APP_META_KEYS.legacyMigrationVersion, database);
  if (typeof currentVersion === 'number' && currentVersion >= LEGACY_MIGRATION_VERSION) {
    return { status: 'already-migrated' };
  }

  const raw = readRawLegacyBlob();
  if (raw === null) {
    await markMigrationDone(database);
    return { status: 'no-legacy-data' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // JSON mal formado: NO tocar nada, NO marcar como completada — ver
    // INVALID LEGACY DATA en la especificación.
    console.error('[legacyMigration] localStorage["chuletaC1_v1"] no es JSON válido; se deja intacto.', e);
    return { status: 'invalid-legacy-data', reason: 'json-parse-error' };
  }

  if (!isValidTopLevelShape(parsed)) {
    console.error('[legacyMigration] localStorage["chuletaC1_v1"] tiene una forma inesperada; se deja intacto.', parsed);
    return { status: 'invalid-legacy-data', reason: 'unexpected-shape' };
  }

  const legacy = parsed;
  const nowIso = new Date().toISOString();
  const flashcardIds = new Set(getFlashcards().map((c) => c.id));

  const summary: MigrationSummary = {
    topicsMigrated: 0,
    topicsSkippedOrphan: [],
    flashcardsMigrated: 0,
    flashcardsSkippedOrphan: [],
    quizSessionsMigrated: 0,
    quizHistoryEntriesSkipped: 0,
    studyFsIndexMigrated: false,
  };

  try {
    await database.transaction(
      'rw',
      database.appMeta,
      database.topicProgress,
      database.flashcardProgress,
      database.quizSessions,
      async () => {
        // studied → topicProgress. Solo true: en legacy `false`/ausente son
        // equivalentes (Record<string,boolean> leído por verdad), y el
        // modelo nuevo tampoco distingue "false" de "sin fila".
        for (const [topicId, value] of Object.entries(legacy.studied ?? {})) {
          if (value !== true) continue;
          if (!getTopicById(topicId)) {
            summary.topicsSkippedOrphan.push(topicId);
            console.warn(`[legacyMigration] studied["${topicId}"] no corresponde a ningún tema actual; se omite.`);
            continue;
          }
          await database.topicProgress.put({ topicId, studied: true, updatedAt: nowIso });
          summary.topicsMigrated++;
        }

        // known → flashcardProgress. Mismo criterio "solo true" que arriba.
        for (const [flashcardId, value] of Object.entries(legacy.known ?? {})) {
          if (value !== true) continue;
          if (!flashcardIds.has(flashcardId)) {
            summary.flashcardsSkippedOrphan.push(flashcardId);
            console.warn(`[legacyMigration] known["${flashcardId}"] no corresponde a ninguna flashcard actual; se omite.`);
            continue;
          }
          await database.flashcardProgress.put({ flashcardId, known: true, updatedAt: nowIso });
          summary.flashcardsMigrated++;
        }

        // studyFsIndex → appMeta (preferencia GLOBAL, no por tema — ver schema.ts).
        if (typeof legacy.studyFsIndex === 'number' && Number.isInteger(legacy.studyFsIndex)) {
          const clamped = Math.min(Math.max(legacy.studyFsIndex, 0), STUDY_FS_STEPS_LENGTH - 1);
          await database.appMeta.put({ key: APP_META_KEYS.studyFsIndex, value: clamped });
          summary.studyFsIndexMigrated = true;
        }

        // quizHistory → quizSessions (sin quizAnswers: legacy no registraba
        // respuesta por respuesta — no se fabrican). Entradas individuales
        // con forma inesperada se omiten y se cuentan, sin abortar el resto.
        for (const entry of legacy.quizHistory ?? []) {
          if (!isValidQuizHistoryEntry(entry)) {
            summary.quizHistoryEntriesSkipped++;
            console.warn('[legacyMigration] entrada de quizHistory con forma inesperada; se omite.', entry);
            continue;
          }
          await database.quizSessions.put({
            id: crypto.randomUUID(),
            startedAt: entry.date,
            completedAt: entry.date,
            scope: undefined,
            totalQuestions: entry.total,
            blankAnswers: 0,
            completed: true,
            migratedFromLegacy: true,
            legacyPct: entry.pct,
          });
          summary.quizSessionsMigrated++;
        }

        await database.appMeta.put({ key: APP_META_KEYS.legacyMigrationVersion, value: LEGACY_MIGRATION_VERSION });
        const createdAt = await database.appMeta.get(APP_META_KEYS.databaseCreatedAt);
        if (!createdAt) await database.appMeta.put({ key: APP_META_KEYS.databaseCreatedAt, value: nowIso });
      },
    );
  } catch (e) {
    // Dexie ya revirtió toda la transacción (todo o nada) — no queda
    // ningún dato a medio migrar, y legacyMigrationVersion tampoco se
    // marcó (ese put también formaba parte de la transacción abortada).
    console.error('[legacyMigration] la transacción falló; se revirtió por completo, nada quedó a medio migrar.', e);
    return { status: 'migration-failed', reason: e instanceof Error ? e.message : String(e) };
  }

  return { status: 'migrated', summary };
}

async function markMigrationDone(database: ChuletaC1DB): Promise<void> {
  await database.transaction('rw', database.appMeta, async () => {
    await setMeta(APP_META_KEYS.legacyMigrationVersion, LEGACY_MIGRATION_VERSION, database);
    const createdAt = await database.appMeta.get(APP_META_KEYS.databaseCreatedAt);
    if (!createdAt) await setMeta(APP_META_KEYS.databaseCreatedAt, new Date().toISOString(), database);
  });
}
