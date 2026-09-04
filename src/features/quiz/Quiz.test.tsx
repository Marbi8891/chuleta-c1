// src/features/quiz/Quiz.test.tsx
//
// Tests mínimos de Fase 2 para Test. El cálculo del resultado se comprueba
// sin conocer de antemano el contenido de las preguntas: se lee de cada
// pregunta, tras responder, si la clase "correct" recayó en la opción
// pulsada, y se compara ese recuento con el marcador final — así se
// verifica la LÓGICA de puntuación, no un dato de contenido concreto.

import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { QuizSetupPage } from './QuizSetupPage';
import { QuizRunPage } from './QuizRunPage';
import { QuizResultsPage } from './QuizResultsPage';

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
});
