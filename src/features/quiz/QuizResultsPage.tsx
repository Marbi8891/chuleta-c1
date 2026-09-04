// src/features/quiz/QuizResultsPage.tsx
//
// Migración de paintResults() (legacy/index.original.html líneas 887-938).
// El registro en el historial (saveState_quizHistory) ya ocurrió en
// goNext() al completar el test (ver QuizContext.tsx) — aquí solo se pinta.
//
// "Repetir solo los fallos" no vuelve a mezclar el pool de falladas, igual
// que en legacy (`quizWrong.map(q=>({...q}))` sin shuffle).

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuiz } from '../../app/QuizContext';

export function QuizResultsPage() {
  const navigate = useNavigate();
  const { state, startQuiz } = useQuiz();

  useEffect(() => {
    if (state.questions.length === 0) navigate('/quiz', { replace: true });
  }, [state.questions.length, navigate]);

  if (state.questions.length === 0) return null;

  const total = state.questions.length;
  const pct = total ? Math.round((state.score / total) * 100) : 0;
  const circumference = 2 * Math.PI * 57;
  const offset = circumference * (1 - pct / 100);

  const breakdownEntries = Object.entries(state.temaTally);

  function handleRetryWrong() {
    startQuiz(state.wrong.map((q) => ({ ...q })));
    navigate('/quiz/run');
  }

  return (
    <div className="results">
      <div className="score-ring">
        <svg viewBox="0 0 132 132" role="img" aria-label={`${pct}% de aciertos`}>
          <circle className="track" cx="66" cy="66" r="57" />
          <circle
            className="fill"
            cx="66"
            cy="66"
            r="57"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="center">
          <span className="n">{pct}%</span>
          <span className="d">
            {state.score}/{total}
          </span>
        </div>
      </div>
      <h2>{pct >= 70 ? 'Buen resultado' : 'Sigue repasando'}</h2>
      <p className="sub">
        {state.score} de {total} preguntas correctas
      </p>

      <div className="tema-breakdown">
        {breakdownEntries.map(([id, tally]) => {
          const cls = tally.correct === tally.total ? 'good' : tally.correct === 0 ? 'bad' : '';
          return (
            <div className="tb-row" key={id}>
              <span className="tb-tema">{id}</span>
              <span className="tb-title">{tally.title}</span>
              <span className={'tb-score' + (cls ? ' ' + cls : '')}>
                {tally.correct}/{tally.total}
              </span>
            </div>
          );
        })}
      </div>

      {state.wrong.length > 0 && (
        <div className="miss-list">
          <h3>Preguntas falladas ({state.wrong.length})</h3>
          {state.wrong.map((q) => {
            const correctIdx = ['a', 'b', 'c', 'd'].indexOf(q.answer);
            return (
              <div className="miss-item" key={q.id}>
                <div className="mi-stem">{q.stem}</div>
                <div className="mi-correct">
                  Correcta: {q.answer}) {q.opts[correctIdx]}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="results-actions">
        {state.wrong.length > 0 && (
          <button type="button" className="btn-primary" onClick={handleRetryWrong}>
            Repetir solo los fallos
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: '12px 22px', fontSize: '14px' }}
          onClick={() => navigate('/quiz')}
        >
          Nuevo test
        </button>
      </div>
    </div>
  );
}
