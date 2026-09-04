// src/app/StatsStrip.tsx
//
// Migración de refreshStats() (legacy/index.original.html líneas 497-502) y
// de la sección .stats-strip (líneas 365-370).

import { getFlashcards, getQuestions } from '../data/index';
import { getTemasOrdered } from '../data/topics';
import { useStudiedTopics } from '../db/topicProgress';

export function StatsStrip() {
  const studied = useStudiedTopics();
  const temasCount = getTemasOrdered().length;
  const studiedCount = Object.values(studied).filter(Boolean).length;
  const questionsCount = getQuestions().length;
  const cardsCount = getFlashcards().length;

  return (
    <section className="stats-strip">
      <div className="stat-tile">
        <div className="num">{temasCount}</div>
        <div className="label">Temas cargados</div>
      </div>
      <div className="stat-tile">
        <div className="num">{studiedCount}</div>
        <div className="label">Temas leídos</div>
      </div>
      <div className="stat-tile">
        <div className="num">{questionsCount}</div>
        <div className="label">Preguntas de test</div>
      </div>
      <div className="stat-tile">
        <div className="num">{cardsCount}</div>
        <div className="label">Flashcards</div>
      </div>
    </section>
  );
}
