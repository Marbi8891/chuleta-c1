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
  StudyEventRecord,
  ErrorRecord,
  ErrorNotebookProcessedSessionRecord,
} from './schema';

export interface ChuletaC1DB extends Dexie {
  appMeta: EntityTable<AppMetaRecord, 'key'>;
  topicProgress: EntityTable<TopicProgressRecord, 'topicId'>;
  flashcardProgress: EntityTable<FlashcardProgressRecord, 'flashcardId'>;
  quizSessions: EntityTable<QuizSessionRecord, 'id'>;
  quizAnswers: EntityTable<QuizAnswerRecord, 'id'>;
  studyEvents: EntityTable<StudyEventRecord, 'id'>;
  errorRecords: EntityTable<ErrorRecord, 'questionId'>;
  errorNotebookProcessedSessions: EntityTable<ErrorNotebookProcessedSessionRecord, 'sessionId'>;
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

  // v2 — Study Intelligence, Fase 1 (STUDY EVENT FOUNDATION). Puramente
  // aditiva: las cinco tablas de v1 se repiten sin cambios (Dexie exige
  // declarar el schema COMPLETO de cada versión, no un diff — omitir una
  // tabla aquí la borraría) y se añade `studyEvents`, vacía por defecto, así
  // que no hace falta ningún `.upgrade()` que transforme datos existentes.
  // Ver docs/STUDY_INTELLIGENCE_ARCHITECTURE.md, sección 2.1, para el plan
  // de versiones completo de esta iniciativa.
  //
  // Índices: `type`/`timestamp`/`topicId`/`questionId`/`quizSessionId` son
  // los únicos campos que las Fases 1-8 necesitan consultar directamente
  // (por tipo de evento, por rango de fecha, por tema, por pregunta, por
  // sesión de test) — ver src/db/studyEvents.ts. No se indexa `metadata`
  // (objeto libre; IndexedDB no lo admite como índice útil) ni `flashcardId`
  // (todavía ningún consumidor lo necesita como índice; se añadiría en una
  // versión futura si una fase concreta lo requiriera).
  db.version(2).stores({
    appMeta: 'key',
    topicProgress: 'topicId',
    flashcardProgress: 'flashcardId',
    quizSessions: 'id',
    quizAnswers: '++id, sessionId',
    studyEvents: '++id, type, timestamp, topicId, questionId, quizSessionId',
  });

  // v3 — Study Intelligence, Fase 2 (CUADERNO DE ERRORES). Igual de aditiva
  // que v2: las seis tablas anteriores se repiten sin cambios y se añaden
  // dos tablas nuevas y vacías, así que tampoco hace falta ningún
  // `.upgrade()`. Ver docs/STUDY_INTELLIGENCE_ARCHITECTURE.md, sección 2.1,
  // y src/db/schema.ts para el razonamiento de cada campo.
  //
  // Índices de `errorRecords`: `topicId` (filtrar el cuaderno por tema) y
  // `status` (pestañas "Pendientes"/"En repaso"/"Dominadas" de la UI) son
  // las dos únicas formas en que la Fase 2 necesita consultar la tabla
  // aparte de por su PK (questionId). `errorNotebookProcessedSessions` no
  // necesita más índice que su PK (sessionId): solo se consulta por
  // existencia puntual, nunca en lista.
  db.version(3).stores({
    appMeta: 'key',
    topicProgress: 'topicId',
    flashcardProgress: 'flashcardId',
    quizSessions: 'id',
    quizAnswers: '++id, sessionId',
    studyEvents: '++id, type, timestamp, topicId, questionId, quizSessionId',
    errorRecords: 'questionId, topicId, status',
    errorNotebookProcessedSessions: 'sessionId',
  });

  return db;
}

/** Instancia compartida por toda la app (producción). Los tests crean la suya con createDb(nombreDeTest). */
export const db = createDb();
