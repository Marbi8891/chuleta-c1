// src/features/quiz/QuizSetupPage.tsx
//
// Migración de renderQuizSetup() (legacy/index.original.html líneas
// 791-820): elección del número de preguntas (10/20/40/todas, recortado al
// tamaño real del pool) y botón para empezar.

import { useNavigate } from 'react-router-dom';
import { getQuizBanks } from '../../data/index';
import { useScope } from '../../app/ScopeContext';
import { shuffle, useQuiz } from '../../app/QuizContext';
import { buildQuizPool } from './buildQuizPool';

export function QuizSetupPage() {
  const { scope } = useScope();
  const { state, setCount, startQuiz } = useQuiz();
  const navigate = useNavigate();

  if (scope.size === 0) {
    return <div className="empty-note">Selecciona al menos un tema en «Alcance» para generar un test.</div>;
  }

  const poolSize = getQuizBanks()
    .filter((t) => scope.has(t.id))
    .reduce((n, t) => n + t.questions.length, 0);

  const choiceVals = [10, 20, 40, poolSize].filter((v, i, arr) => v <= poolSize && arr.indexOf(v) === i);
  if (!choiceVals.length) choiceVals.push(poolSize);
  const effectiveCount = choiceVals.includes(state.count) && state.count <= poolSize ? state.count : choiceVals[0]!;

  function handleStart() {
    const pool = shuffle(buildQuizPool(scope)).slice(0, effectiveCount);
    startQuiz(pool, Array.from(scope));
    navigate('/quiz/run');
  }

  return (
    <div className="quiz-setup">
      <h2>Configura tu test</h2>
      <p>
        {poolSize} preguntas disponibles en el alcance seleccionado ({scope.size} tema{scope.size === 1 ? '' : 's'}).
      </p>
      <div className="count-choices">
        {choiceVals.map((v) => (
          <button
            key={v}
            type="button"
            className={v === effectiveCount ? 'on' : ''}
            onClick={() => setCount(v)}
          >
            {v === poolSize ? `Todas (${v})` : v}
          </button>
        ))}
      </div>
      <button type="button" className="btn-primary" onClick={handleStart}>
        Empezar test
      </button>
    </div>
  );
}
