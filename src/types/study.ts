// src/types/study.ts
import type { BloqueId, TemaCode, TemaId } from './content';

/** Un tema de estudio (contenido en Markdown), tal como vive en study_bank.json. */
export interface StudyTopic {
  /** Identificador compuesto, ej. "I-T01". Clave primaria de tema en toda la app. */
  id: TemaId;
  bloque: BloqueId;
  tema: TemaCode;
  /** Título largo oficial del tema (incluye subtítulos separados por ". "). */
  title: string;
  /** Contenido íntegro en Markdown (incluye tablas, listas, énfasis). */
  markdown: string;
}
