// src/db/legacyMigration.test.ts
//
// Cobertura obligatoria de la especificación de Fase 3 (IDEMPOTENCIA,
// INVALID LEGACY DATA, MIGRATION TRANSACTION) + mapeo de campos legacy
// (LEGACY MIGRATION MAPPING) sobre una instancia Dexie de test aislada
// (fake-indexeddb — ver src/setupTests.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, type ChuletaC1DB } from './db';
import { runLegacyMigration } from './legacyMigration';
import { STORAGE_KEY } from '../state/appState';
import { APP_META_KEYS, LEGACY_MIGRATION_VERSION } from './schema';
import { getFlashcards, getTopics } from '../data/index';

let testDb: ChuletaC1DB;

beforeEach(() => {
  // Nombre único por test: nada compartido entre tests, sin depender del
  // afterEach global de setupTests.ts (que limpia la instancia POR DEFECTO,
  // no esta).
  testDb = createDb(`test-legacy-migration-${Math.random().toString(36).slice(2)}`);
  localStorage.clear();
});

afterEach(async () => {
  testDb.close();
  await testDb.delete();
});

async function allRows<T>(table: { toArray: () => Promise<T[]> }): Promise<T[]> {
  return table.toArray();
}

describe('runLegacyMigration — sin datos legacy', () => {
  it('si no hay clave en localStorage, marca la migración como completada sin tocar el resto', async () => {
    const result = await runLegacyMigration(testDb);
    expect(result.status).toBe('no-legacy-data');
    const version = await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion);
    expect(version?.value).toBe(LEGACY_MIGRATION_VERSION);
    expect(await allRows(testDb.topicProgress)).toHaveLength(0);
    expect(await allRows(testDb.flashcardProgress)).toHaveLength(0);
    expect(await allRows(testDb.quizSessions)).toHaveLength(0);
  });
});

describe('runLegacyMigration — IDEMPOTENCIA (obligatorio)', () => {
  it('ejecutarla dos veces no duplica ni cambia nada la segunda vez', async () => {
    const topic = getTopics()[0]!;
    const card = getFlashcards()[0]!;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        known: { [card.id]: true },
        studied: { [topic.id]: true },
        quizHistory: [{ date: '2026-01-01T00:00:00.000Z', total: 10, pct: 80 }],
        studyFsIndex: 2,
      }),
    );

    const first = await runLegacyMigration(testDb);
    expect(first.status).toBe('migrated');

    const topicRowsAfterFirst = await allRows(testDb.topicProgress);
    const flashcardRowsAfterFirst = await allRows(testDb.flashcardProgress);
    const sessionRowsAfterFirst = await allRows(testDb.quizSessions);
    expect(topicRowsAfterFirst).toHaveLength(1);
    expect(flashcardRowsAfterFirst).toHaveLength(1);
    expect(sessionRowsAfterFirst).toHaveLength(1);

    const second = await runLegacyMigration(testDb);
    expect(second.status).toBe('already-migrated');

    expect(await allRows(testDb.topicProgress)).toEqual(topicRowsAfterFirst);
    expect(await allRows(testDb.flashcardProgress)).toEqual(flashcardRowsAfterFirst);
    expect(await allRows(testDb.quizSessions)).toEqual(sessionRowsAfterFirst);
  });
});

describe('runLegacyMigration — CONCURRENCIA (Fase 3B, obligatorio)', () => {
  it('dos llamadas concurrentes con Promise.all no migran dos veces (especialmente quizHistory, que antes usaba randomUUID)', async () => {
    const topic = getTopics()[0]!;
    const card = getFlashcards()[0]!;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        known: { [card.id]: true },
        studied: { [topic.id]: true },
        quizHistory: [
          { date: '2026-01-01T00:00:00.000Z', total: 10, pct: 80 },
          { date: '2026-01-02T00:00:00.000Z', total: 20, pct: 55 },
        ],
      }),
    );

    // Ambas llamadas parten de "no migrado" antes de que ninguna haya
    // escrito nada — exactamente el escenario que la re-lectura de versión
    // DENTRO de la transacción (ver legacyMigration.ts) tiene que resolver.
    const [r1, r2] = await Promise.all([runLegacyMigration(testDb), runLegacyMigration(testDb)]);

    // Una de las dos migra de verdad, la otra la observa ya hecha (en
    // cualquier orden — no se puede predecir cuál gana la carrera).
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['already-migrated', 'migrated']);

    // El resultado final es EXACTAMENTE el de una única migración: nunca
    // el doble. Este es el caso que quizHistory con crypto.randomUUID()
    // habría duplicado silenciosamente (dos ids aleatorios distintos para
    // el mismo dato) — de ahí el cambio a ids deterministas.
    expect(await allRows(testDb.topicProgress)).toHaveLength(1);
    expect(await allRows(testDb.flashcardProgress)).toHaveLength(1);
    expect(await allRows(testDb.quizSessions)).toHaveLength(2); // NO 4

    const version = await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion);
    expect(version?.value).toBe(LEGACY_MIGRATION_VERSION);

    // Un tercer intento posterior (ya no concurrente) confirma que queda
    // estable en already-migrated, sin seguir escribiendo nada.
    const third = await runLegacyMigration(testDb);
    expect(third.status).toBe('already-migrated');
    expect(await allRows(testDb.quizSessions)).toHaveLength(2);
  });
});

describe('runLegacyMigration — INVALID LEGACY DATA (obligatorio)', () => {
  it('JSON mal formado: no toca IndexedDB, no marca la migración, deja localStorage intacto', async () => {
    const raw = '{not valid json';
    localStorage.setItem(STORAGE_KEY, raw);

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('invalid-legacy-data');
    expect(await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion)).toBeUndefined();
    expect(await allRows(testDb.topicProgress)).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });

  it('estructura inesperada (array en vez de objeto): no toca IndexedDB, no marca la migración', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('invalid-legacy-data');
    expect(await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion)).toBeUndefined();
  });

  it('campo `studied` con forma inesperada (string en vez de objeto): no toca IndexedDB, no marca la migración', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ studied: 'no-es-un-objeto' }));

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('invalid-legacy-data');
    expect(await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion)).toBeUndefined();
  });

  it('una entrada de quizHistory con forma inesperada se omite y se cuenta, sin abortar el resto', async () => {
    const topic = getTopics()[0]!;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studied: { [topic.id]: true },
        quizHistory: [
          { date: '2026-01-01T00:00:00.000Z', total: 10, pct: 80 },
          { total: 'no-es-un-numero' }, // entrada corrupta
        ],
      }),
    );

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('unreachable');
    expect(result.summary.quizSessionsMigrated).toBe(1);
    expect(result.summary.quizHistoryEntriesSkipped).toBe(1);
    expect(result.summary.topicsMigrated).toBe(1); // el resto de la migración no se ve afectado
  });

});

describe('runLegacyMigration — STORAGE UNAVAILABLE (Fase 3B, obligatorio)', () => {
  it('localStorage inaccesible (lanza al leer): NO es "nada que migrar" — no marca la migración, permite reintentar', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage inaccesible');
    });
    try {
      const result = await runLegacyMigration(testDb);
      expect(result.status).toBe('storage-unavailable');
      // A diferencia de 'no-legacy-data': NO se marca legacyMigrationVersion,
      // así que un arranque posterior (con localStorage ya recuperado)
      // vuelve a intentar la migración en vez de darla por completada.
      expect(await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion)).toBeUndefined();
      expect(await allRows(testDb.topicProgress)).toHaveLength(0);
      expect(await allRows(testDb.flashcardProgress)).toHaveLength(0);
      expect(await allRows(testDb.quizSessions)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }

    // localStorage ya responde de nuevo (sin datos legacy reales) — el
    // siguiente intento debe completarse con normalidad, no seguir varado.
    const retry = await runLegacyMigration(testDb);
    expect(retry.status).toBe('no-legacy-data');
    const version = await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion);
    expect(version?.value).toBe(LEGACY_MIGRATION_VERSION);
  });
});

describe('runLegacyMigration — orphan references (CONTENT VALIDATION)', () => {
  it('studied/known que referencian temas o flashcards inexistentes se omiten y se cuentan, no se inventan', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studied: { 'NO-EXISTE-T99': true },
        known: { 'no-existe-c999': true },
      }),
    );

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('migrated');
    if (result.status !== 'migrated') throw new Error('unreachable');
    expect(result.summary.topicsMigrated).toBe(0);
    expect(result.summary.topicsSkippedOrphan).toEqual(['NO-EXISTE-T99']);
    expect(result.summary.flashcardsMigrated).toBe(0);
    expect(result.summary.flashcardsSkippedOrphan).toEqual(['no-existe-c999']);
    expect(await allRows(testDb.topicProgress)).toHaveLength(0);
    expect(await allRows(testDb.flashcardProgress)).toHaveLength(0);
  });
});

describe('runLegacyMigration — MIGRATION TRANSACTION (obligatorio)', () => {
  it('si la transacción falla a mitad, se revierte por completo y no se marca como migrada', async () => {
    const topic = getTopics()[0]!;
    const card = getFlashcards()[0]!;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        studied: { [topic.id]: true }, // se escribe ANTES del fallo
        known: { [card.id]: true },
        quizHistory: [{ date: '2026-01-01T00:00:00.000Z', total: 10, pct: 80 }], // se escribiría DESPUÉS
      }),
    );

    // Fuerza un fallo real de Dexie a mitad de la transacción (después de
    // escribir topicProgress, antes de llegar a quizSessions): un `put`
    // con una clave primaria de tipo inválido para IndexedDB.
    const originalPut = testDb.quizSessions.put.bind(testDb.quizSessions);
    const putSpy = vi
      .spyOn(testDb.quizSessions, 'put')
      .mockImplementationOnce(
        () => Promise.reject(new Error('fallo simulado a mitad de transacción')) as ReturnType<typeof originalPut>,
      );

    try {
      const result = await runLegacyMigration(testDb);
      expect(result.status).toBe('migration-failed');
    } finally {
      putSpy.mockRestore();
      void originalPut;
    }

    // Nada quedó a medio migrar: ni siquiera lo que se escribió ANTES del fallo.
    expect(await allRows(testDb.topicProgress)).toHaveLength(0);
    expect(await allRows(testDb.flashcardProgress)).toHaveLength(0);
    expect(await allRows(testDb.quizSessions)).toHaveLength(0);
    expect(await testDb.appMeta.get(APP_META_KEYS.legacyMigrationVersion)).toBeUndefined();

    // Al no haberse marcado como completada, un siguiente intento reintenta desde cero.
    const retry = await runLegacyMigration(testDb);
    expect(retry.status).toBe('migrated');
    expect(await allRows(testDb.topicProgress)).toHaveLength(1);
    expect(await allRows(testDb.quizSessions)).toHaveLength(1);
  });
});

describe('runLegacyMigration — studyFsIndex (preferencia global, no por tema)', () => {
  it('se migra a appMeta, recortado al rango válido', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ studyFsIndex: 99 }));

    const result = await runLegacyMigration(testDb);

    expect(result.status).toBe('migrated');
    const stored = await testDb.appMeta.get(APP_META_KEYS.studyFsIndex);
    expect(stored?.value).toBe(4); // recortado a STUDY_FS_STEPS.length - 1
  });
});
