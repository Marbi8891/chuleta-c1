// src/db/appMeta.ts — acceso mínimo a la tabla appMeta (metadatos internos).
import type { ChuletaC1DB } from './db';
import { db as defaultDb } from './db';
import type { AppMetaKey } from './schema';

export async function getMeta<T = unknown>(key: AppMetaKey, database: ChuletaC1DB = defaultDb): Promise<T | undefined> {
  const row = await database.appMeta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: AppMetaKey, value: unknown, database: ChuletaC1DB = defaultDb): Promise<void> {
  await database.appMeta.put({ key, value });
}
