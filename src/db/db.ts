// src/db/db.ts
//
// Fase 3 — instancia Dexie única de la app. Ver docs/adr/0006-persistence-dexie.md
// para la decisión de usar Dexie/IndexedDB y el razonamiento de cada tabla.
//
// DATABASE VERSIONING (obligatorio por especificación de Fase 3):
//   - Se declara explícitamente `db.version(1).stores(...)` aunque hoy solo
//     exista v1 — nunca dejarlo implícito.
//   - Futuras migraciones de schema: SIEMPRE añadir `db.version(2)`,
//     `db.version(3)`, ... con `.upgrade()` cuando haga falta transformar
//     datos existentes. NUNCA usar `db.delete()` / `indexedDB.deleteDatabase()`
//     como estrategia de "actualizar el schema" — eso borra el progreso real
//     del usuario.
//   - El nombre de la base (DB_NAME, ver schema.ts) no debe cambiar nunca:
//     cambiarlo equivale a crear una base nueva y perder el acceso a la
//     existente.
//
// Índices: deliberadamente mínimos. Los datasets de progreso de un único
// usuario en este dominio son pequeños (≤25 temas, ≤165 flashcards; los
// tests/respuestas crecen con el uso pero siguen siendo modestos para una
// app personal) — no se indexan campos que no necesitan búsqueda directa
// (p.ej. `known`/`studied`, que son booleanos: IndexedDB ni siquiera admite
// booleanos como clave de índice; se leen y filtran en memoria, ver
// flashcardProgress.ts/topicProgress.ts).

import Dexie, { type EntityTable } from 'dexie';
import { DB_NAME } from './schema';
import type {
  AppMetaRecord,
  TopicProgressRecord,
  FlashcardProgressRecord,
  QuizSessionRecord,
  QuizAnswerRecord,
} from './schema';

export interface ChuletaC1DB extends Dexie {
  appMeta: EntityTable<AppMetaRecord, 'key'>;
  topicProgress: EntityTable<TopicProgressRecord, 'topicId'>;
  flashcardProgress: EntityTable<FlashcardProgressRecord, 'flashcardId'>;
  quizSessions: EntityTable<QuizSessionRecord, 'id'>;
  quizAnswers: EntityTable<QuizAnswerRecord, 'id'>;
}

export function createDb(name: string = DB_NAME): ChuletaC1DB {
  const db = new Dexie(name) as ChuletaC1DB;

  // v1 — schema inicial de Fase 3. Índices: solo lo que de verdad se
  // consulta por campo distinto de la PK (sessionId en quizAnswers, para
  // poder recuperar las respuestas de una sesión concreta).
  db.version(1).stores({
    appMeta: 'key',
    topicProgress: 'topicId',
    flashcardProgress: 'flashcardId',
    quizSessions: 'id',
    quizAnswers: '++id, sessionId',
  });

  return db;
}

/** Instancia compartida por toda la app (producción). Los tests crean la suya con createDb(nombreDeTest). */
export const db = createDb();
