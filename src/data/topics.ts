// src/data/topics.ts
//
// Migración de BLOQUES / TEMAS / BLOQUE_ORDER (legacy/index.original.html,
// líneas 432-444): la lista de bloques con su etiqueta larga, y la lista
// combinada de temas (uno por banco de test cargado) en el orden en que la
// app legacy los recorre para "Alcance", la portada de Estudiar y la
// navegación prev/next del artículo.
//
// Igual que en legacy: el título mostrado prefiere el título largo oficial
// de STUDYBANK cuando existe, y cae al título (más corto) de QUIZBANK si no.

import { getQuizBanks, getTopics } from './index';
import type { BloqueId, TemaCode, TemaId } from '../types/content';

export const BLOQUE_ORDER: readonly BloqueId[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export interface BloqueDef {
  id: BloqueId;
  label: string;
}

export const BLOQUES: readonly BloqueDef[] = [
  { id: 'I', label: 'Bloque I · Materias comunes' },
  { id: 'II', label: 'Bloque II · Atención al ciudadano y gestión documental' },
  { id: 'III', label: 'Bloque III · Derecho Administrativo' },
  { id: 'IV', label: 'Bloque IV · Función pública / personal' },
];

export interface TemaSummary {
  bloque: BloqueId;
  tema: TemaCode;
  id: TemaId;
  title: string;
  bloqueName: string;
}

let cachedTemas: TemaSummary[] | null = null;

/** Lista combinada de temas (uno por banco de test), ordenada como en legacy. */
export function getTemasOrdered(): readonly TemaSummary[] {
  if (cachedTemas) return cachedTemas;

  const studyTitleById = new Map<TemaId, string>();
  for (const topic of getTopics()) studyTitleById.set(topic.id, topic.title);

  const temas = getQuizBanks().map((qb) => ({
    bloque: qb.bloque,
    tema: qb.tema,
    id: qb.id,
    title: studyTitleById.get(qb.id) ?? qb.title,
    bloqueName: qb.bloqueName,
  }));

  temas.sort((a, b) =>
    a.bloque === b.bloque
      ? a.tema.localeCompare(b.tema)
      : BLOQUE_ORDER.indexOf(a.bloque) - BLOQUE_ORDER.indexOf(b.bloque),
  );

  cachedTemas = temas;
  return temas;
}
