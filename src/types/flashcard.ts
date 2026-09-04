// src/types/flashcard.ts
import type { BloqueId, TemaCode, TemaId } from './content';

/** Una flashcard, tal como vive en flashcards.json. */
export interface Flashcard {
  /** Identificador propio de la flashcard, ej. "c1". Único dentro de flashcards.json. */
  id: string;
  bloque: BloqueId;
  tema: TemaCode;
  /** Referencia al tema de estudio (debe existir en study_bank.json — se valida). */
  id_tema: TemaId;
  temaTitle: string;
  bloqueName: string;
  /** Cara frontal; en el contenido migrado suele incluir un hueco "______" a completar. */
  front: string;
  back: string;
}
