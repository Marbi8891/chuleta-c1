// src/state/appState.ts
//
// FASE 3 (PERSISTENCE FOUNDATION): este módulo ha DEJADO de ser la fuente
// de escritura de progreso de la app — eso ahora es src/db/ (Dexie /
// IndexedDB). Se conserva únicamente como referencia de solo lectura de la
// forma y la clave de la fuente legacy real:
// `localStorage["chuletaC1_v1"]`, tal y como la escribía la app original
// de un solo fichero y, después, la app React de la Fase 2.
//
// src/db/legacyMigration.ts lee esa clave de forma independiente (no
// reexporta ningún estado mutable de aquí) para poder distinguir "no hay
// nada que migrar" de "hay algo pero está corrupto" — algo que un
// try/catch silencioso no permite. Ningún código de esta app vuelve a
// ESCRIBIR en STORAGE_KEY: es, a todos los efectos, de solo lectura desde
// esta fase en adelante (ver "LEGACY SOURCE" en la especificación de
// Fase 3 — no se borra ni se sobrescribe).

/** Clave real usada por la app legacy y por la app React de la Fase 2. NO renombrar. */
export const STORAGE_KEY = 'chuletaC1_v1';

export interface QuizHistoryEntry {
  date: string;
  total: number;
  pct: number;
}

/** Forma exacta del blob legacy, tal y como lo escribía saveState() (legacy) / persist() (Fase 2). */
export interface AppState {
  known: Record<string, boolean>;
  studied: Record<string, boolean>;
  quizHistory: QuizHistoryEntry[];
  studyFsIndex?: number;
}
