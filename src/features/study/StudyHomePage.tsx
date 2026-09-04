// src/features/study/StudyHomePage.tsx
//
// Migración de paintStudyHome() (legacy/index.original.html líneas 536-566):
// portada de Estudiar, temas agrupados por bloque, con insignia de tema,
// título, marca de "leído" y flecha. React escapa el título automáticamente
// (JSX), así que no hace falta el equivalente de escapeHtml() aquí.

import { Link } from 'react-router-dom';
import { BLOQUES, getTemasOrdered } from '../../data/topics';
import { useAppState } from '../../state/useAppState';

function CheckIcon() {
  return (
    <svg className="sr-check" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg className="sr-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StudyHomePage() {
  const appState = useAppState();
  const temas = getTemasOrdered();

  return (
    <div className="study-home">
      <p className="study-intro">
        Elige un tema para leerlo tal y como está en tus apuntes. Al terminar, encontrarás el botón para hacer
        su test de preguntas estilo oposición.
      </p>
      {BLOQUES.map((b) => {
        const temasBloque = temas.filter((t) => t.bloque === b.id);
        if (!temasBloque.length) return null;
        return (
          <div className="study-bloque" key={b.id}>
            <div className="study-bloque-head">
              {b.label} <span className="cnt">{temasBloque.length} tema{temasBloque.length === 1 ? '' : 's'}</span>
            </div>
            <div className="study-list">
              {temasBloque.map((t) => {
                const done = !!appState.studied[t.id];
                return (
                  <Link key={t.id} to={`/study/${t.id}`} className={'study-row' + (done ? ' done' : '')}>
                    <span className="sr-badge">{t.tema}</span>
                    <span className="sr-title">{t.title}</span>
                    <CheckIcon />
                    <ArrowIcon />
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
