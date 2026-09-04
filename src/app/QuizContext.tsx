// src/app/QuizContext.tsx
//
// Migración del estado de test de legacy/index.original.html (líneas
// 773-780 y 822-937): quizCount, quizQuestions, quizIndex, quizScore,
// quizAnswered, quizSelected, quizWrong, quizTemaTally, y las funciones
// startQuiz/selectAnswer/paintQuiz("Siguiente")/paintResults.
//
// Vive en un Context de toda la app (no solo bajo /quiz) porque
// startSingleTemaQuiz (el botón "Hacer el test →" del artículo de Estudiar)
// arranca un test y navega directamente a la pantalla de preguntas, saltando
// la de configuración — igual que en legacy.
//
// Identidad de pregunta: se usa QuestionRef.id (QuestionId global,
// "<topicId>-Q<NNN>") como clave de React en las listas, nunca el índice del
// array — requisito explícito de la Fase 2.

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { getQuizBankByTopic } from '../data/index';
import type { AnswerKey, QuestionRef } from '../types/quiz';
import type { TemaId } from '../types/content';
import { pushQuizHistory } from '../state/appState';

export interface TemaTally {
  correct: number;
  total: number;
  title: string;
}

interface QuizState {
  /** Tamaño de test elegido en la pantalla de configuración (10/20/40/todas). */
  count: number;
  questions: QuestionRef[];
  index: number;
  score: number;
  answered: boolean;
  selected: AnswerKey | null;
  wrong: QuestionRef[];
  temaTally: Record<TemaId, TemaTally>;
  /** true cuando se ha respondido la última pregunta y toca ir a resultados. */
  completed: boolean;
}

const INITIAL_STATE: QuizState = {
  count: 20,
  questions: [],
  index: 0,
  score: 0,
  answered: false,
  selected: null,
  wrong: [],
  temaTally: {},
  completed: false,
};

type QuizAction =
  | { type: 'SET_COUNT'; count: number }
  | { type: 'START'; questions: QuestionRef[] }
  | { type: 'SELECT'; letter: AnswerKey }
  | { type: 'NEXT' };

function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'SET_COUNT':
      return { ...state, count: action.count };
    case 'START':
      return {
        ...state,
        questions: action.questions,
        index: 0,
        score: 0,
        answered: false,
        selected: null,
        wrong: [],
        temaTally: {},
        completed: false,
      };
    case 'SELECT': {
      if (state.answered) return state; // igual que `if(quizAnswered) return;`
      const q = state.questions[state.index];
      if (!q) return state;
      const isCorrect = action.letter === q.answer;
      const prevTally = state.temaTally[q.topicId] ?? {
        correct: 0,
        total: 0,
        title: getQuizBankByTopic(q.topicId)?.title ?? q.topicId,
      };
      const tally: TemaTally = {
        ...prevTally,
        total: prevTally.total + 1,
        correct: prevTally.correct + (isCorrect ? 1 : 0),
      };
      return {
        ...state,
        answered: true,
        selected: action.letter,
        score: state.score + (isCorrect ? 1 : 0),
        wrong: isCorrect ? state.wrong : [...state.wrong, q],
        temaTally: { ...state.temaTally, [q.topicId]: tally },
      };
    }
    case 'NEXT': {
      const isLast = state.index + 1 >= state.questions.length;
      if (isLast) return { ...state, completed: true };
      return { ...state, index: state.index + 1, answered: false, selected: null };
    }
    default:
      return state;
  }
}

interface QuizContextValue {
  state: QuizState;
  setCount: (count: number) => void;
  /** Arranca un test con un pool ya construido (mezclado por el llamante). */
  startQuiz: (questions: QuestionRef[]) => void;
  selectAnswer: (letter: AnswerKey) => void;
  /**
   * Equivalente al click de "Siguiente": si era la última pregunta, registra
   * el resultado en el historial persistente (una sola vez) y marca el test
   * como completado; si no, avanza a la siguiente pregunta.
   */
  goNext: () => void;
}

const QuizContext = createContext<QuizContextValue | null>(null);

export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(quizReducer, INITIAL_STATE);

  const setCount = useCallback((count: number) => dispatch({ type: 'SET_COUNT', count }), []);
  const startQuiz = useCallback((questions: QuestionRef[]) => dispatch({ type: 'START', questions }), []);
  const selectAnswer = useCallback((letter: AnswerKey) => dispatch({ type: 'SELECT', letter }), []);

  const goNext = useCallback(() => {
    const isLast = state.index + 1 >= state.questions.length;
    if (isLast && !state.completed) {
      const total = state.questions.length;
      const pct = total ? Math.round((state.score / total) * 100) : 0;
      pushQuizHistory(total, pct);
    }
    dispatch({ type: 'NEXT' });
  }, [state.index, state.questions.length, state.completed, state.score]);

  const value = useMemo<QuizContextValue>(
    () => ({ state, setCount, startQuiz, selectAnswer, goNext }),
    [state, setCount, startQuiz, selectAnswer, goNext],
  );

  return <QuizContext.Provider value={value}>{children}</QuizContext.Provider>;
}

export function useQuiz(): QuizContextValue {
  const ctx = useContext(QuizContext);
  if (!ctx) throw new Error('useQuiz debe usarse dentro de <QuizProvider>');
  return ctx;
}

/** Fisher-Yates in-place, idéntico al usado en buildQuizPool/buildFlashQueue/startSingleTemaQuiz. */
export function shuffle<T>(arr: T[]): T[] {
  const pool = arr.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool;
}
