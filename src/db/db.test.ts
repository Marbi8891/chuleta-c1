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
    expect(v1).toEqual(['appMeta', 'flashcardProgress', 'quizAnswers', 'quizSessions', 'topicProgress'].sort());
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
