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

  it('declara explícitamente version(1) con las 5 tablas de Fase 3', () => {
    const v1 = db.tables.map((t) => t.name).sort();
    expect(v1).toEqual(
      ['appMeta', 'flashcardProgress', 'quizAnswers', 'quizSessions', 'topicProgress', 'studyEvents'].sort(),
    );
  });

  it('Study Intelligence Fase 1: version(2) añade studyEvents sin tocar las 5 tablas de v1', async () => {
    const isolated = createDb(`test-db-v2-${Math.random().toString(36).slice(2)}`);
    try {
      await isolated.open();
      expect(isolated.verno).toBe(2);
      const tableNames = isolated.tables.map((t) => t.name).sort();
      expect(tableNames).toEqual(
        ['appMeta', 'flashcardProgress', 'quizAnswers', 'quizSessions', 'topicProgress', 'studyEvents'].sort(),
      );
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
