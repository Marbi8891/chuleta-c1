// src/types/quiz.ts
import type { BloqueId, TemaCode, TemaId } from './content';
import type { QuestionId } from '../data/ids';

/** Letra de opción de respuesta, tal como se codifica en origen. */
export type AnswerKey = 'a' | 'b' | 'c' | 'd';

/** Forma legacy de una pregunta, tal cual vive en quiz_bank.json (JSON.parse: opts es string[]). */
export interface QuizQuestion {
  /** Número de pregunta dentro de su banco (1-indexado, no único globalmente). */
  num: number;
  stem: string;
  opts: string[];
  answer: AnswerKey;
}

/** Un banco de test por tema, tal como vive en quiz_bank.json (forma legacy, sin enriquecer). */
export interface QuizBank {
  /** Identificador compuesto, ej. "I-T01". Debe existir como StudyTopic.id (se valida). */
  id: TemaId;
  bloque: BloqueId;
  tema: TemaCode;
  /** Nombre de archivo original del banco (heredado del pipeline legacy; no se usa para I/O nuevo). */
  file: string;
  title: string;
  bloqueName: string;
  questions: QuizQuestion[];
}

/**
 * Vista enriquecida de una pregunta para consumo de la app: añade el
 * QuestionId global estable (ver src/data/ids.ts) y el topicId, y tipa
 * `opts` como tupla de 4 (verificado en tiempo de ejecución al construirla
 * — ver toQuadruple() en src/data/index.ts — nunca con un cast inseguro).
 * No sustituye a QuizQuestion: QuizQuestion es la forma legacy usada para
 * demostrar equivalencia 1:1 con el origen; QuestionRef es la forma que
 * consumen los componentes.
 */
export interface QuestionRef {
  id: QuestionId;
  topicId: TemaId;
  number: number;
  stem: string;
  opts: readonly [string, string, string, string];
  answer: AnswerKey;
}
