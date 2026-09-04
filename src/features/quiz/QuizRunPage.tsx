// src/features/quiz/QuizRunPage.tsx
//
// Migración de paintQuiz()/selectAnswer() (legacy/index.original.html
// líneas 829-885). La transición a resultados que en legacy ocurría dentro
// de paintQuiz (`if(quizIndex >= quizQuestions.length){ paintResults(); }`)
// aquí es una navegación real a /quiz/results, disparada por goNext()
// cuando marca el test como completado (ver QuizContext.tsx).
//
// Identidad: la pregunta activa se localiza por índice dentro del array ya
// construido (igual que legacy), pero cada opción usa su letra a/b/c/d como
// key — nunca la posición del array — y la pregunta en sí se identifica en
// toda la app por QuestionRef.id (QuestionId global), no por este índice.

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQuizBankByTopic } from '../../data/index';
import { useQuiz } from '../../app/QuizContext';
import type { AnswerKey } from '../../types/quiz';

const LETTERS: readonly AnswerKey[] = ['a', 'b', 'c', 'd'];

export function QuizRunPage() {
  const navigate = useNavigate();
  const { state, selectAnswer, goNext } = useQuiz();
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.questions.length === 0) navigate('/quiz', { replace: true });
  }, [state.questions.length, navigate]);

  useEffect(() => {
    if (state.completed) navigate('/quiz/results');
  }, [state.completed, navigate]);

  useEffect(() => {
    // Igual que `document.getElementById("nextBtn").focus();` al final de
    // selectAnswer(): lleva el foco de teclado al botón "Siguiente" en
    // cuanto se responde.
    if (state.answered) nextBtnRef.current?.focus();
  }, [state.answered]);

  const q = state.questions[state.index];
  if (!q) return null; // en tránsito hacia /quiz (sin test activo) o /quiz/results (test completado)

  const temaTitle = getQuizBankByTopic(q.topicId)?.title ?? q.topicId;
  const progressPct = Math.round((state.index / state.questions.length) * 100);

  return (
    <>
      <div className="quiz-meta">
        <span>
          Pregunta {state.index + 1} / {state.questions.length}
        </span>
        <span className="quiz-score">Aciertos: {state.score}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <div className="q-card">
        <span className="q-tema">
          {q.topicId} · {temaTitle}
        </span>
        <p className="q-stem">{q.stem}</p>
        <div className="q-options">
          {q.opts.map((optText, i) => {
            const letter = LETTERS[i]!;
            let className = 'q-opt';
            if (state.answered) {
              className += ' locked';
              if (letter === q.answer) className += ' correct';
              else if (letter === state.selected) className += ' incorrect';
            }
            return (
              <button
                key={letter}
                type="button"
                className={className}
                disabled={state.answered}
                onClick={() => selectAnswer(letter)}
              >
                <span className="letter">{letter}</span>
                <span>{optText}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="quiz-next-row">
        <button
          type="button"
          ref={nextBtnRef}
          className="btn-primary"
          disabled={!state.answered}
          onClick={goNext}
        >
          Siguiente
        </button>
      </div>
    </>
  );
}
