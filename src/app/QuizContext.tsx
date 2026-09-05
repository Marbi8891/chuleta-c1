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

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { getQuizBankByTopic } from '../data/index';
import type { AnswerKey, QuestionRef } from '../types/quiz';
import type { TemaId } from '../types/content';
import { recordQuizSession } from '../db/quiz';
import { recordStudyEvent } from '../db/studyEvents';
import { reportWriteError } from '../db/reportWriteError';

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
  | { type: 'START'; questions: QuestionRef[]; scope: TemaId[]; sessionId: string; startedAt: string }
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
      // Study Intelligence, Fase 1: sessionId/startedAt ahora se generan en
      // startQuiz() (el callback imperativo, no el reducer) para que
      // startQuiz pueda emitir el evento QUIZ_STARTED con el MISMO
      // sessionId que luego usará recordQuizSession al completar el test —
      // un reducer que genera su propio id "a escondidas" no permite eso
      // sin duplicar la generación (y arriesgarse a que difieran).
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
        sessionId: action.sessionId,
        startedAt: action.startedAt,
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
  const startQuiz = useCallback((questions: QuestionRef[], scope: TemaId[]) => {
    const sessionId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    dispatch({ type: 'START', questions, scope, sessionId, startedAt });
    // Fire-and-forget deliberado (mismo patrón que markTopicStudied en
    // StudyArticlePage, Fase 3B punto 5): arrancar un test no debe esperar
    // a que el evento se persista, pero un fallo real tampoco debe quedar
    // como promesa rechazada sin gestionar.
    recordStudyEvent({ type: 'QUIZ_STARTED', quizSessionId: sessionId, timestamp: startedAt }).catch((e) =>
      reportWriteError('recordStudyEvent:QUIZ_STARTED', e),
    );
  }, []);
  const selectAnswer = useCallback((letter: AnswerKey) => dispatch({ type: 'SELECT', letter }), []);

  // Fase 3C, punto 6 (DOUBLE CLICK SAVE LOCK, opcional): `state.saving` ya
  // evita un doble guardado en el caso normal, pero es estado de React —
  // publicado en el siguiente render, no inmediatamente. Dos llamadas a
  // goNext() disparadas en el mismo tick (antes de que React re-renderice
  // con `saving: true`) verían ambas `state.saving === false` y ambas
  // podrían arrancar un guardado. recordQuizSession ya es idempotente por
  // sessionId (Fase 3B, punto 4), así que esto NUNCA corrompía datos — era
  // como mucho una escritura duplicada innecesaria, no un bug funcional.
  // Un `useRef` se lee/escribe de forma síncrona e inmediata (no espera a
  // un render), así que sirve como candado real dentro del mismo tick,
  // sin añadir ninguna otra complejidad. `state.saving` se conserva tal
  // cual para pintar la UI (botón "Guardando…"/"Reintentar").
  const savingRef = useRef(false);

  const goNext = useCallback(() => {
    const isLast = state.index + 1 >= state.questions.length;
    if (!isLast) {
      dispatch({ type: 'NEXT' });
      return;
    }
    // Última pregunta: no avanzar el índice (no hay pregunta "siguiente")
    // — en su lugar, intentar persistir la sesión y solo entonces marcar
    // `completed`. Si ya está completada, o ya hay un guardado en curso
    // (comprobado primero por el ref síncrono, luego por el estado — ver
    // el comentario de savingRef arriba), no hacer nada.
    if (state.completed || savingRef.current || state.saving) return;
    savingRef.current = true;
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
      } finally {
        // Libera el candado tanto en éxito como en fallo: un reintento tras
        // SAVE_ERROR debe poder volver a entrar.
        savingRef.current = false;
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
