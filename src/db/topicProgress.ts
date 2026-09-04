// src/db/topicProgress.ts — progreso de Estudiar (tabla topicProgress) +
// preferencia global de tamaño de letra (tabla appMeta, ver schema.ts).

import { useLiveQuery } from 'dexie-react-hooks';
import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import { getMeta, setMeta } from './appMeta';
import { APP_META_KEYS } from './schema';
import type { TemaId } from '../types/content';

/** Equivalente a `state.studied[topicId] = true; saveState();` en paintStudyArticle() (legacy). */
export async function markTopicStudied(topicId: TemaId, database: ChuletaC1DB = defaultDb): Promise<void> {
  const existing = await database.topicProgress.get(topicId);
  if (existing?.studied) return; // idempotente, igual que el guard de appState.ts
  await database.topicProgress.put({ topicId, studied: true, updatedAt: new Date().toISOString() });
}

/**
 * Hook reactivo: `{ [topicId]: true }` para los temas leídos (paridad con
 * la forma `AppState.studied` de legacy, para que StudyHomePage/StatsStrip
 * no tengan que cambiar de forma de datos). Dataset pequeño (≤25 filas):
 * se trae la tabla entera y se reduce en memoria, sin índice secundario.
 */
export function useStudiedTopics(database: ChuletaC1DB = defaultDb): Record<TemaId, boolean> {
  const rows = useLiveQuery(() => database.topicProgress.toArray(), [database]);
  const result: Record<TemaId, boolean> = {};
  for (const row of rows ?? []) {
    if (row.studied) result[row.topicId] = true;
  }
  return result;
}

const STUDY_FS_STEPS = [16, 18, 20, 22, 24] as const;
const STUDY_FS_DEFAULT_INDEX = 1; // 18px, igual que STUDY_FS_DEFAULT en legacy/appState.ts

export function getStudyFsSteps(): readonly number[] {
  return STUDY_FS_STEPS;
}

function clampFsIndex(index: number): number {
  return Math.min(Math.max(index, 0), STUDY_FS_STEPS.length - 1);
}

export async function getStudyFsIndex(database: ChuletaC1DB = defaultDb): Promise<number> {
  const stored = await getMeta<number>(APP_META_KEYS.studyFsIndex, database);
  return Number.isInteger(stored) ? clampFsIndex(stored as number) : STUDY_FS_DEFAULT_INDEX;
}

export async function setStudyFsIndex(index: number, database: ChuletaC1DB = defaultDb): Promise<void> {
  await setMeta(APP_META_KEYS.studyFsIndex, clampFsIndex(index), database);
}
