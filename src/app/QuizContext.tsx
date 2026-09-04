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
//
// Fase 3: al completar un test se persiste en Dexie (quizSessions +
// quizAnswers, ver src/db/quiz.ts) en vez de en localStorage
// (pushQuizHistory, appState.ts — retirado). `answers` acumula cada
// respuesta con su QuestionId real (nunca el índice del array) para que
// quizAnswers pueda referenciarlas una a una. `scope` y `sessionId` se
// fijan al arrancar el test (START) y no cambian durante su desarrollo.
//
// Fase 3B (SAFE QUIZ COMPLETION): `completed` ya NO se marca en el mismo
// tick que se pulsa "Siguiente" en la última pregunta — antes se disparaba
// `void recordQuizSession(...)` (sin esperar) y se despachaba NEXT en el
// mismo gesto, así que la navegación a resultados podía ocurrir antes de
// que Dexie hubiera confirmado el guardado (o incluso si el guardado
// fallaba silenciosamente). Ahora `completed` solo pasa a `true` tras un
// `await recordQuizSession(...)` que termina con éxito (ver `saving` más
// abajo); si falla, el estado del test (sessionId, answers, score...)
// permanece intacto en memoria y `saveError` queda con el motivo, para que
// la UI pueda mostrarlo y ofrecer reintentar sin perder la sesión.

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react';
import { getQuizBankByTopic } from '../data/index';
import type { AnswerKey, QuestionRef } from '../types/quiz';
import type { TemaId } from '../types/content';
import { recordQuizSession } from '../db/quiz';

export interface TemaTally {
  correct: number;
  total: number;
  title: string;
}

interface AnsweredQuestion {
  questionId: QuestionRef['id'];
  selectedAnswer: AnswerKey;
  correct: boolean;
  answeredAt: string;
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
  /**
   * true SOLO cuando la sesión ya se ha persistido con éxito (Fase 3B) —
   * hasta entonces, aunque la última pregunta ya esté respondida, el test
   * sigue "en curso" a efectos de esta bandera. Ver `saving`/`saveError`.
   */
  completed: boolean;
  /** true mientras `recordQuizSession` está en vuelo para la última pregunta (Fase 3B). */
  saving: boolean;
  /** Motivo del último intento de guardado fallido, o null si no ha fallado (o aún no se ha reintentado). Fase 3B. */
  saveError: string | null;
  /** Identidad de la sesión actual (Fase 3) — estable durante todo el test, ver START. */
  sessionId: string;
  startedAt: string;
  /** Alcance con el que se arrancó el test (fijado en START, no cambia aunque «Alcance» cambie durante el test). */
  scope: TemaId[];
  /** Una entrada por pregunta respondida, en orden — para persistir quizAnswers al completar. */
  answers: AnsweredQuestion[];
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
  saving: false,
  saveError: null,
  sessionId: '',
  startedAt: '',
  scope: [],
  answers: [],
};

type QuizAction =
  | { type: 'SET_COUNT'; count: number }
  | { type: 'START'; questions: QuestionRef[]; scope: TemaId[] }
  | { type: 'SELECT'; letter: AnswerKey }
  | { type: 'NEXT' }
  | { type: 'SAVE_START' }
  | { type: 'SAVE_SUCCESS' }
  | { type: 'SAVE_ERROR'; message: string };

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
        saving: false,
        saveError: null,
        sessionId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        scope: action.scope,
        answers: [],
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
      const answeredEntry: AnsweredQuestion = {
        questionId: q.id,
        selectedAnswer: action.letter,
        correct: isCorrect,
        answeredAt: new Date().toISOString(),
      };
      return {
        ...state,
        answered: true,
        selected: action.letter,
        score: state.score + (isCorrect ? 1 : 0),
        wrong: isCorrect ? state.wrong : [...state.wrong, q],
        temaTally: { ...state.temaTally, [q.topicId]: tally },
        answers: [...state.answers, answeredEntry],
      };
    }
    case 'NEXT':
      // Solo se despacha para preguntas que NO son la última (ver goNext):
      // la última pregunta pasa por SAVE_START/SAVE_SUCCESS/SAVE_ERROR en
      // su lugar (Fase 3B, SAFE QUIZ COMPLETION), nunca por aquí.
      return { ...state, index: state.index + 1, answered: false, selected: null };
    case 'SAVE_START':
      return { ...state, saving: true, saveError: null };
    case 'SAVE_SUCCESS':
      return { ...state, saving: false, saveError: null, completed: true };
    case 'SAVE_ERROR':
      // Deliberado: NO se toca `completed` (sigue en false — el test no se
      // da por terminado) ni ningún otro campo de la sesión (sessionId,
      // answers, score...) — así un reintento (nueva llamada a goNext)
      // dispone de exactamente los mismos datos para volver a intentar el
      // guardado, sin haber perdido la sesión en memoria.
      return { ...state, saving: false, saveError: action.message };
    default:
      return state;
  }
}

interface QuizContextValue {
  state: QuizState;
  setCount: (count: number) => void;
  /** Arranca un test con un pool ya construido (mezclado por el llamante) y el alcance del que procede. */
  startQuiz: (questions: QuestionRef[], scope: TemaId[]) => void;
  selectAnswer: (letter: AnswerKey) => void;
  /**
   * Equivalente al click de "Siguiente": si no era la última pregunta,
   * avanza de inmediato. Si era la última, intenta persistir la sesión
   * completa (quizSessions + quizAnswers, ver src/db/quiz.ts) y SOLO marca
   * el test como completado (`state.completed`) si ese guardado tiene
   * éxito — ver `state.saving`/`state.saveError` y SAFE QUIZ COMPLETION
   * (Fase 3B). Si ya hay un guardado en curso o el test ya se completó, no
   * hace nada (evita doble guardado por doble click). Volver a llamarla
   * tras un fallo reintenta el mismo guardado — recordQuizSession es
   * idempotente por `sessionId` (Fase 3B, punto 4), así que un reintento
   * nunca duplica respuestas.
   */
  goNext: () => void;
}

const QuizContext = createContext<QuizContextValue | null>(null);

export function QuizProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(quizReducer, INITIAL_STATE);

  const setCount = useCallback((count: number) => dispatch({ type: 'SET_COUNT', count }), []);
  const startQuiz = useCallback(
    (questions: QuestionRef[], scope: TemaId[]) => dispatch({ type: 'START', questions, scope }),
    [],
  );
  const selectAnswer = useCallback((letter: AnswerKey) => dispatch({ type: 'SELECT', letter }), []);

  const goNext = useCallback(() => {
    const isLast = state.index + 1 >= state.questions.length;
    if (!isLast) {
      dispatch({ type: 'NEXT' });
      return;
    }
    // Última pregunta: no avanzar el índice (no hay pregunta "siguiente")
    // — en su lugar, intentar persistir la sesión y solo entonces marcar
    // `completed`. Si ya está completada (no debería poder llamarse dos
    // veces desde la UI, pero por si acaso) o ya hay un guardado en curso,
    // no hacer nada — evita un guardado duplicado por un doble click.
    if (state.completed || state.saving) return;
    dispatch({ type: 'SAVE_START' });
    void (async () => {
      try {
        await recordQuizSession({
          id: state.sessionId,
          startedAt: state.startedAt,
          completedAt: new Date().toISOString(),
          scope: state.scope,
          answers: state.answers,
        });
        dispatch({ type: 'SAVE_SUCCESS' });
      } catch (e) {
        // No fingir que el test se guardó: el estado de la sesión
        // (sessionId, answers, score...) permanece intacto en `state` —
        // dispatch no lo toca aquí — así que una nueva llamada a goNext()
        // (el usuario pulsando "Reintentar") vuelve a intentar el mismo
        // guardado con los mismos datos.
        console.error('[QuizContext] no se pudo guardar la sesión de test; se puede reintentar sin perder los datos.', e);
        dispatch({ type: 'SAVE_ERROR', message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [
    state.index,
    state.questions.length,
    state.completed,
    state.saving,
    state.sessionId,
    state.startedAt,
    state.scope,
    state.answers,
  ]);

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
