// src/features/quiz/Quiz.test.tsx
//
// Tests mínimos de Fase 2 para Test. El cálculo del resultado se comprueba
// sin conocer de antemano el contenido de las preguntas: se lee de cada
// pregunta, tras responder, si la clase "correct" recayó en la opción
// pulsada, y se compara ese recuento con el marcador final — así se
// verifica la LÓGICA de puntuación, no un dato de contenido concreto.

import { useEffect, useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { QuizSetupPage } from './QuizSetupPage';
import { QuizRunPage } from './QuizRunPage';
import { QuizResultsPage } from './QuizResultsPage';
import { recordQuizSession } from '../../db/quiz';
import { useQuiz } from '../../app/QuizContext';
import { getQuestions } from '../../data/index';
import { db } from '../../db/db';

// Fase 3B, SAFE QUIZ COMPLETION: se mockea recordQuizSession (envolviendo
// la implementación real) para poder forzar un fallo de guardado en un
// único test sin tocar Dexie/fake-indexeddb — el resto de los tests de
// este fichero siguen usando el comportamiento real (persisten de verdad).
vi.mock('../../db/quiz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/quiz')>();
  return { ...actual, recordQuizSession: vi.fn(actual.recordQuizSession) };
});

beforeEach(() => {
  // El mock es compartido por todo el fichero (vi.mock es de módulo, no
  // por test) — sin esto, el recuento de llamadas de un test "arrastra"
  // las llamadas reales hechas por los tests anteriores de este mismo
  // fichero (p. ej. "calcula el resultado final correctamente" ya
  // completa un test entero antes de llegar aquí).
  vi.mocked(recordQuizSession).mockClear();
});

function QuizRoutes() {
  return (
    <Routes>
      <Route path="/quiz" element={<QuizSetupPage />} />
      <Route path="/quiz/run" element={<QuizRunPage />} />
      <Route path="/quiz/results" element={<QuizResultsPage />} />
    </Routes>
  );
}

function startTenQuestionQuiz() {
  renderWithProviders(<QuizRoutes />, { route: '/quiz' });
  fireEvent.click(screen.getByRole('button', { name: '10' }));
  fireEvent.click(screen.getByRole('button', { name: 'Empezar test' }));
}

// Fase 3C, punto 6 (DOUBLE CLICK SAVE LOCK): arranca un test de UNA sola
// pregunta (así el índice 0 ya es "la última") y expone un botón que llama
// a goNext() DOS VECES seguidas dentro del mismo manejador síncrono — esto
// reproduce exactamente la condición de carrera descrita en la especifi-
// cación (dos llamadas en el mismo tick, antes de que React publique
// `saving: true`), cosa que dos fireEvent.click() por separado NO pueden
// reproducir (React/Testing Library ya habría re-renderizado —y deshabili-
// tado el botón— entre uno y otro).
function DoubleGoNextHarness() {
  const { state, startQuiz, goNext } = useQuiz();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const q = getQuestions()[0]!;
    startQuiz([q], [q.topicId]);
  }, [startQuiz]);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          goNext();
          goNext();
        }}
      >
        doble-siguiente
      </button>
      {state.completed && <p>guardado</p>}
    </div>
  );
}

describe('Test', () => {
  it('la pantalla de configuración carga preguntas del alcance seleccionado', () => {
    renderWithProviders(<QuizRoutes />, { route: '/quiz' });
    expect(screen.getByText(/preguntas disponibles en el alcance seleccionado/)).toBeInTheDocument();
  });

  it('cada pregunta muestra 4 opciones y permite responder', () => {
    startTenQuestionQuiz();
    const options = document.querySelectorAll('.q-opt');
    expect(options).toHaveLength(4);

    const nextBtn = screen.getByRole('button', { name: 'Siguiente' });
    expect(nextBtn).toBeDisabled();

    fireEvent.click(options[0]!);
    expect(nextBtn).toBeEnabled();
  });

  it('calcula el resultado final correctamente', async () => {
    startTenQuestionQuiz();
    let expectedScore = 0;

    for (let i = 0; i < 10; i++) {
      const options = document.querySelectorAll('.q-opt');
      expect(options).toHaveLength(4);
      fireEvent.click(options[0]!);
      if (options[0]!.classList.contains('correct')) expectedScore++;
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    }

    expect(
      await screen.findByText(new RegExp(`${expectedScore} de 10 preguntas correctas`)),
    ).toBeInTheDocument();
  });

  it('SAFE QUIZ COMPLETION (Fase 3B, obligatorio): si falla el guardado, no navega a resultados y permite reintentar sin perder el test', async () => {
    vi.mocked(recordQuizSession).mockRejectedValueOnce(new Error('fallo simulado de guardado'));

    startTenQuestionQuiz();
    for (let i = 0; i < 9; i++) {
      fireEvent.click(document.querySelectorAll('.q-opt')[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    }
    // Última pregunta: goNext() intenta persistir y el mock rechaza una vez.
    fireEvent.click(document.querySelectorAll('.q-opt')[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    // No se finge que el test se guardó: sigue en la pantalla de preguntas
    // (no navega a /quiz/results), con un mensaje de error recuperable.
    expect(await screen.findByText(/no se ha podido guardar el resultado del test/i)).toBeInTheDocument();
    expect(screen.queryByText(/preguntas correctas/)).not.toBeInTheDocument();
    expect(recordQuizSession).toHaveBeenCalledTimes(1);

    // El botón pasa a "Reintentar" — la sesión (respuestas, score) sigue
    // intacta en memoria, así que un segundo intento (sin el mock forzando
    // el fallo esta vez) completa el test con normalidad.
    const retryBtn = await screen.findByRole('button', { name: 'Reintentar' });
    fireEvent.click(retryBtn);

    expect(await screen.findByText(/preguntas correctas/)).toBeInTheDocument();
    expect(recordQuizSession).toHaveBeenCalledTimes(2);
    // Mismo sessionId en ambos intentos — recordQuizSession es idempotente
    // por sessionId (Fase 3B, punto 4), así que reintentar no duplica nada.
    const [firstCallArgs] = vi.mocked(recordQuizSession).mock.calls[0]!;
    const [secondCallArgs] = vi.mocked(recordQuizSession).mock.calls[1]!;
    expect(secondCallArgs.id).toBe(firstCallArgs.id);
  });

  it('Study Intelligence Fase 1: arrancar un test registra QUIZ_STARTED con el mismo sessionId que luego usa recordQuizSession', async () => {
    startTenQuestionQuiz();

    await vi.waitFor(async () => {
      expect(await db.studyEvents.where('type').equals('QUIZ_STARTED').count()).toBe(1);
    });
    const [started] = await db.studyEvents.where('type').equals('QUIZ_STARTED').toArray();
    expect(started?.quizSessionId).toBeTruthy();

    for (let i = 0; i < 10; i++) {
      fireEvent.click(document.querySelectorAll('.q-opt')[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    }
    await screen.findByText(/preguntas correctas/);

    const [completeArgs] = vi.mocked(recordQuizSession).mock.calls[0]!;
    expect(completeArgs.id).toBe(started?.quizSessionId);
  });

  it('DOUBLE CLICK SAVE LOCK (Fase 3C, punto 6, opcional): dos llamadas a goNext() en el mismo tick solo guardan una vez', async () => {
    renderWithProviders(<DoubleGoNextHarness />);

    const btn = await screen.findByRole('button', { name: 'doble-siguiente' });
    fireEvent.click(btn); // dispara goNext() + goNext() síncronamente, dentro del mismo manejador

    await screen.findByText('guardado');
    expect(recordQuizSession).toHaveBeenCalledTimes(1);
  });
});
