// src/db/db.test.ts — invariantes de DATABASE VERSIONING / DATABASE NAME
// (especificación de Fase 3): el nombre no debe cambiar nunca por accidente,
// y el schema se declara explícitamente con db.version(1).stores(...).
import { describe, expect, it } from 'vitest';
import { db, createDb } from './db';
import { DB_NAME } from './schema';

describe('db', () => {
  it('el nombre de la base es el documentado en ADR-0006 y no cambia por accidente', () => {
    expect(DB_NAME).toBe('chuletaC1');
    expect(db.name).toBe(DB_NAME);
  });

  it('declara explícitamente version(1) con las 5 tablas de Fase 3 (más las añadidas por Study Intelligence)', () => {
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      [
        'appMeta',
        'flashcardProgress',
        'quizAnswers',
        'quizSessions',
        'topicProgress',
        'studyEvents',
        'errorRecords',
        'errorNotebookProcessedSessions',
      ].sort(),
    );
  });

  it('Study Intelligence Fase 1: version(2) añade studyEvents sin tocar las 5 tablas de v1', async () => {
    const isolated = createDb(`test-db-v2-${Math.random().toString(36).slice(2)}`);
    try {
      await isolated.open();
      // createDb() declara TODAS las versiones incondicionalmente, así que
      // abrir una base nueva siempre aterriza en la más reciente (hoy v3,
      // Fase 2) — no en "2" a secas. Lo que de verdad importa comprobar
      // aquí no es el número exacto, sino que lo que v2 añadió (studyEvents)
      // sigue presente y operativo en el schema vigente, sin importar
      // cuántas versiones más se hayan declarado después.
      expect(isolated.verno).toBeGreaterThanOrEqual(2);
      const tableNames = isolated.tables.map((t) => t.name);
      // Subconjunto, no igualdad exacta — por la misma razón de arriba:
      // versiones posteriores (Fase 2 en adelante) añaden más tablas.
      for (const expected of ['appMeta', 'flashcardProgress', 'quizAnswers', 'quizSessions', 'topicProgress', 'studyEvents']) {
        expect(tableNames).toContain(expected);
      }
      // Las cinco tablas de v1 siguen siendo perfectamente escribibles y
      // legibles tras la subida de versión (migración puramente aditiva).
      await isolated.topicProgress.put({ topicId: 'I-T01', studied: true, updatedAt: '2026-01-01T00:00:00.000Z' });
      expect(await isolated.topicProgress.get('I-T01')).toEqual({
        topicId: 'I-T01',
        studied: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      // studyEvents existe, está vacía, y admite el índice `type` (usado por
      // queryStudyEvents) desde el primer momento.
      expect(await isolated.studyEvents.count()).toBe(0);
      await isolated.studyEvents.add({ type: 'TOPIC_OPENED', timestamp: '2026-01-01T00:00:00.000Z', topicId: 'I-T01' });
      const byType = await isolated.studyEvents.where('type').equals('TOPIC_OPENED').toArray();
      expect(byType).toHaveLength(1);
    } finally {
      isolated.close();
      await isolated.delete();
    }
  });

  it('Study Intelligence Fase 2: version(3) añade errorRecords y errorNotebookProcessedSessions sin tocar las 6 tablas anteriores', async () => {
    const isolated = createDb(`test-db-v3-${Math.random().toString(36).slice(2)}`);
    try {
      await isolated.open();
      // Mismo razonamiento que en el test de v2: se comprueba que v3 ya
      // está incluida (>=), no que sea exactamente la última — así este
      // test no se rompe cuando una fase futura añada version(4).
      expect(isolated.verno).toBeGreaterThanOrEqual(3);
      const tableNames = isolated.tables.map((t) => t.name);
      for (const expected of [
        'appMeta',
        'flashcardProgress',
        'quizAnswers',
        'quizSessions',
        'topicProgress',
        'studyEvents',
        'errorRecords',
        'errorNotebookProcessedSessions',
      ]) {
        expect(tableNames).toContain(expected);
      }
      // studyEvents (añadida en v2) sigue intacta tras subir a v3.
      await isolated.studyEvents.add({ type: 'TOPIC_OPENED', timestamp: '2026-01-01T00:00:00.000Z', topicId: 'I-T01' });
      expect(await isolated.studyEvents.count()).toBe(1);
      // errorRecords existe, vacía, y admite los índices topicId/status desde el primer momento.
      expect(await isolated.errorRecords.count()).toBe(0);
      await isolated.errorRecords.add({
        questionId: 'I-T01-Q001',
        topicId: 'I-T01',
        firstFailedAt: '2026-01-01T00:00:00.000Z',
        lastFailedAt: '2026-01-01T00:00:00.000Z',
        failureCount: 1,
        correctCountAfterFailure: 0,
        status: 'NEW',
        masteryScore: 0,
      });
      expect(await isolated.errorRecords.where('status').equals('NEW').count()).toBe(1);
      expect(await isolated.errorRecords.where('topicId').equals('I-T01').count()).toBe(1);
    } finally {
      isolated.close();
      await isolated.delete();
    }
  });

  it('createDb(nombre) permite instancias aisladas para tests, sin tocar la instancia por defecto', async () => {
    const isolated = createDb(`test-db-isolated-${Math.random().toString(36).slice(2)}`);
    try {
      await isolated.appMeta.put({ key: 'foo', value: 'bar' });
      expect(await db.appMeta.get('foo')).toBeUndefined(); // la instancia por defecto no se ve afectada
    } finally {
      isolated.close();
      await isolated.delete();
    }
  });
});
