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
  /**
   * Fase 3C, DEFERRED MIGRATION CONFLICT POLICY: topics con fila ya
   * existente en topicProgress ANTES de leer legacy — se omiten sin
   * sobrescribir (EXISTING INDEXEDDB DATA WINS). Solo puede pasar si el
   * usuario generó progreso nuevo mientras la migración estaba diferida
   * (p. ej. arrancó una vez con localStorage inaccesible).
   */
  topicsSkippedExisting: TemaId[];
  flashcardsMigrated: number;
  flashcardsSkippedOrphan: string[];
  /** Igual que topicsSkippedExisting, para flashcardProgress. */
  flashcardsSkippedExisting: string[];
  quizSessionsMigrated: number;
  quizHistoryEntriesSkipped: number;
  studyFsIndexMigrated: boolean;
  /** true si studyFsIndex NO se migró porque appMeta ya tenía un valor (EXISTING WINS). */
  studyFsIndexSkippedExisting: boolean;
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
  | { status: 'migration-failed'; reason: string }
  /**
   * Fase 3B, punto 2: `localStorage.getItem` ha lanzado una excepción — NO
   * es lo mismo que "no hay clave". Es un estado transitorio del storage
   * (modo privado estricto, cuota, entorno roto momentáneamente), no una
   * afirmación de que no hay progreso legacy que migrar. Por eso NO se
   * marca `legacyMigrationVersion` (a diferencia de 'no-legacy-data'):
   * se reintentará en el próximo arranque, con la esperanza de que
   * localStorage vuelva a responder. IndexedDB no se ve afectada por esto
   * y la app sigue siendo usable (ver PersistenceGate).
   */
  | { status: 'storage-unavailable'; reason: string };

/**
 * Distingue "la clave no existe" (`raw: null`, `available: true`) de "no se
 * ha podido ni preguntar" (`available: false`, lanzó `getItem`) — la
 * versión anterior de esta función conflaba ambos casos en `null`, lo que
 * hacía que un fallo transitorio de localStorage se marcara igual que "este
 * usuario nunca tuvo progreso legacy" (Fase 3B, punto 2).
 */
function readRawLegacyBlob(): { available: true; raw: string | null } | { available: false; reason: string } {
  try {
    return { available: true, raw: localStorage.getItem(STORAGE_KEY) };
  } catch (e) {
    return { available: false, reason: e instanceof Error ? e.message : String(e) };
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
 * IDEMPOTENCIA en la especificación de Fase 3, y CONCURRENCIA más abajo).
 * Debe llamarse una vez al arrancar la app, antes de leer progreso
 * persistido (ver PersistenceGate).
 *
 * CONCURRENCIA (Fase 3B, punto 1): la comprobación de
 * `legacyMigrationVersion` de aquí abajo es solo un atajo (evita abrir una
 * transacción de escritura en cada arranque una vez ya migrado) — NO es la
 * garantía de idempotencia. Dos llamadas concurrentes (p. ej. StrictMode,
 * o dos pestañas) podrían leer ambas "no migrado" en este punto antes de
 * que ninguna haya escrito nada. La garantía real está DENTRO de la
 * transacción de más abajo, que vuelve a leer `legacyMigrationVersion` una
 * vez ya tiene el lock de escritura sobre `appMeta`: IndexedDB serializa
 * las transacciones `readwrite` que comparten un object store, así que la
 * segunda transacción en llegar ve siempre el resultado ya escrito por la
 * primera y hace no-op — nunca migra dos veces. Ver el test "MIGRACIÓN
 * CONCURRENTE" en legacyMigration.test.ts, que fuerza exactamente este
 * escenario con `Promise.all`.
 */
export async function runLegacyMigration(database: ChuletaC1DB = defaultDb): Promise<LegacyMigrationResult> {
  const currentVersion = await getMeta<number>(APP_META_KEYS.legacyMigrationVersion, database);
  if (typeof currentVersion === 'number' && currentVersion >= LEGACY_MIGRATION_VERSION) {
    return { status: 'already-migrated' };
  }

  const blob = readRawLegacyBlob();
  if (!blob.available) {
    // Storage inaccesible (Fase 3B, punto 2): NO es "nada que migrar" — es
    // un fallo transitorio. No se marca legacyMigrationVersion, así que se
    // reintentará en el próximo arranque. IndexedDB sigue operativa; la
    // app continúa (ver PersistenceGate).
    console.warn('[legacyMigration] localStorage no está disponible (lanzó al leer); se reintentará en el próximo arranque.', blob.reason);
    return { status: 'storage-unavailable', reason: blob.reason };
  }

  const raw = blob.raw;
  if (raw === null) {
    // Clave realmente ausente: sí es "nada que migrar" — marcar terminado.
    // markMigrationDone también vuelve a comprobar la versión dentro de su
    // propia transacción, así que dos llamadas concurrentes por esta rama
    // tampoco causan ningún problema (la segunda simplemente no-opea).
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
    topicsSkippedExisting: [],
    flashcardsMigrated: 0,
    flashcardsSkippedOrphan: [],
    flashcardsSkippedExisting: [],
    quizSessionsMigrated: 0,
    quizHistoryEntriesSkipped: 0,
    studyFsIndexMigrated: false,
    studyFsIndexSkippedExisting: false,
  };

  // Ganada la carrera dentro de la transacción de abajo (ver CONCURRENCIA):
  // permanece `false` si esta llamada es la que realmente migra; pasa a
  // `true` si, al entrar en la transacción, otra llamada concurrente ya
  // había terminado de migrar primero — en cuyo caso esta no escribe nada.
  let alreadyMigratedConcurrently = false;

  try {
    await database.transaction(
      'rw',
      database.appMeta,
      database.topicProgress,
      database.flashcardProgress,
      database.quizSessions,
      async () => {
        // Re-lectura DENTRO de la transacción — ver el comentario de
        // CONCURRENCIA más arriba. Esto es lo que hace la migración segura
        // bajo llamadas concurrentes, no solo "improbable de que ocurra".
        const versionRow = await database.appMeta.get(APP_META_KEYS.legacyMigrationVersion);
        const versionInsideTx = versionRow?.value;
        if (typeof versionInsideTx === 'number' && versionInsideTx >= LEGACY_MIGRATION_VERSION) {
          alreadyMigratedConcurrently = true;
          return;
        }

        // studied → topicProgress. Solo true: en legacy `false`/ausente son
        // equivalentes (Record<string,boolean> leído por verdad), y el
        // modelo nuevo tampoco distingue "false" de "sin fila".
        //
        // DEFERRED MIGRATION CONFLICT POLICY (Fase 3C, punto 4): EXISTING
        // INDEXEDDB DATA WINS. Antes esto era un `put` incondicional
        // (idempotente frente a SU PROPIA migración anterior, pero no
        // frente a progreso NUEVO generado por el usuario mientras la
        // migración estaba diferida — p. ej. primer arranque con
        // localStorage inaccesible, el usuario estudia varios temas, luego
        // localStorage vuelve y se reintenta la migración). Ahora se
        // comprueba primero si ya hay fila: si la hay, se respeta tal cual
        // (legacy solo rellena huecos, nunca sobrescribe); si no la hay, se
        // importa desde legacy como antes.
        for (const [topicId, value] of Object.entries(legacy.studied ?? {})) {
          if (value !== true) continue;
          if (!getTopicById(topicId)) {
            summary.topicsSkippedOrphan.push(topicId);
            console.warn(`[legacyMigration] studied["${topicId}"] no corresponde a ningún tema actual; se omite.`);
            continue;
          }
          const existing = await database.topicProgress.get(topicId);
          if (existing) {
            summary.topicsSkippedExisting.push(topicId);
            continue;
          }
          await database.topicProgress.put({ topicId, studied: true, updatedAt: nowIso });
          summary.topicsMigrated++;
        }

        // known → flashcardProgress. Mismo criterio "solo true" que arriba,
        // y la MISMA política EXISTING WINS — especialmente importante
        // aquí: Dexie puede tener `known: false` (el usuario marcó "a
        // repasar" tras la fecha de export de legacy) mientras legacy dice
        // `known: true` para esa misma flashcard. Sobrescribir revertiría
        // una decisión más reciente del usuario — no se hace bajo ninguna
        // circunstancia, exista la fila con el valor que exista.
        for (const [flashcardId, value] of Object.entries(legacy.known ?? {})) {
          if (value !== true) continue;
          if (!flashcardIds.has(flashcardId)) {
            summary.flashcardsSkippedOrphan.push(flashcardId);
            console.warn(`[legacyMigration] known["${flashcardId}"] no corresponde a ninguna flashcard actual; se omite.`);
            continue;
          }
          const existing = await database.flashcardProgress.get(flashcardId);
          if (existing) {
            summary.flashcardsSkippedExisting.push(flashcardId);
            continue;
          }
          await database.flashcardProgress.put({ flashcardId, known: true, updatedAt: nowIso });
          summary.flashcardsMigrated++;
        }

        // studyFsIndex → appMeta (preferencia GLOBAL, no por tema — ver
        // schema.ts). Misma política: si el usuario ya fijó una preferencia
        // de tamaño de letra en Dexie mientras la migración estaba
        // diferida, esa elección reciente gana y legacy no la pisa.
        if (typeof legacy.studyFsIndex === 'number' && Number.isInteger(legacy.studyFsIndex)) {
          const existingFsIndex = await database.appMeta.get(APP_META_KEYS.studyFsIndex);
          if (existingFsIndex) {
            summary.studyFsIndexSkippedExisting = true;
          } else {
            const clamped = Math.min(Math.max(legacy.studyFsIndex, 0), STUDY_FS_STEPS_LENGTH - 1);
            await database.appMeta.put({ key: APP_META_KEYS.studyFsIndex, value: clamped });
            summary.studyFsIndexMigrated = true;
          }
        }

        // quizHistory → quizSessions (sin quizAnswers: legacy no registraba
        // respuesta por respuesta — no se fabrican). Entradas individuales
        // con forma inesperada se omiten y se cuentan, sin abortar el resto.
        //
        // ID determinista (Fase 3B, punto 1) en vez de crypto.randomUUID():
        // `legacy-{índice}` en vez de un UUID aleatorio. La garantía real
        // de "no migrar dos veces" ya la da la re-lectura de versión dentro
        // de esta misma transacción (arriba) — pero un id determinista es
        // una segunda capa de seguridad barata: si por lo que sea esta
        // función se invocara fuera de su guarda normal (p. ej. una futura
        // migración manual de re-intento), `put` sobre el mismo id
        // reemplaza la fila en vez de duplicarla. El orden del array de
        // `quizHistory` es estable dentro de una misma migración (no se
        // reordena en ningún punto de este módulo), así que el índice es
        // un id estable para esa ejecución.
        let quizHistoryIndex = 0;
        for (const entry of legacy.quizHistory ?? []) {
          const entryIndex = quizHistoryIndex++;
          if (!isValidQuizHistoryEntry(entry)) {
            summary.quizHistoryEntriesSkipped++;
            console.warn('[legacyMigration] entrada de quizHistory con forma inesperada; se omite.', entry);
            continue;
          }
          await database.quizSessions.put({
            id: `legacy-${entryIndex}`,
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

  if (alreadyMigratedConcurrently) {
    return { status: 'already-migrated' };
  }

  return { status: 'migrated', summary };
}

async function markMigrationDone(database: ChuletaC1DB): Promise<void> {
  // Segura bajo llamadas concurrentes sin necesitar una re-lectura
  // explícita de versión (a diferencia de la rama principal de arriba):
  // `setMeta`/`legacyMigrationVersion` es un `put` sobre una PK fija, así
  // que dos transacciones concurrentes que lleguen aquí simplemente
  // escriben el mismo valor dos veces (idempotente por construcción, no
  // hay filas que duplicar en esta rama).
  await database.transaction('rw', database.appMeta, async () => {
    await setMeta(APP_META_KEYS.legacyMigrationVersion, LEGACY_MIGRATION_VERSION, database);
    const createdAt = await database.appMeta.get(APP_META_KEYS.databaseCreatedAt);
    if (!createdAt) await setMeta(APP_META_KEYS.databaseCreatedAt, new Date().toISOString(), database);
  });
}
