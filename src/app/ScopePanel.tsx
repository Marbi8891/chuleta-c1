// src/app/ScopePanel.tsx
//
// Selector de temas por bloque para las features que dependen de Alcance
// (Test y Repaso). En una pantalla móvil el selector completo ocupa gran parte
// del viewport, así que arranca plegado: el usuario ve inmediatamente el
// contenido propio de la pestaña y puede desplegar Alcance cuando quiera.

import { useState } from 'react';
import { BLOQUES, getTemasOrdered } from '../data/topics';
import { useScope } from './ScopeContext';

function ChevronIcon() {
  return (
    <svg className="scope-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ScopePanel({ hidden }: { hidden: boolean }) {
  const { scope, toggleTema, toggleBloque, selectAll, selectNone } = useScope();
  const [collapsed, setCollapsed] = useState(true);
  const temas = getTemasOrdered();

  if (hidden) return null;

  return (
    <section className={'scope' + (collapsed ? ' collapsed' : '')} id="scopeBox">
      <button type="button" className="scope-head" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <div className="scope-head-left">
          <span className="scope-title">Alcance</span>
          <span className="scope-count">
            {scope.size} tema{scope.size === 1 ? '' : 's'}
          </span>
        </div>
        <ChevronIcon />
      </button>
      <div className="scope-body">
        <div className="scope-global-actions">
          <button type="button" className="btn-ghost" onClick={selectAll}>
            Marcar todo
          </button>
          <button type="button" className="btn-ghost" onClick={selectNone}>
            Vaciar
          </button>
        </div>
        <div>
          {BLOQUES.map((b) => {
            const temasBloque = temas.filter((t) => t.bloque === b.id);
            if (!temasBloque.length) return null;
            const selCount = temasBloque.filter((t) => scope.has(t.id)).length;
            return (
              <div className="bloque-block" key={b.id}>
                <div className="bloque-row">
                  <div className="bloque-name">
                    {b.label} <span>({selCount}/{temasBloque.length})</span>
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => toggleBloque(b.id)}>
                    Alternar
                  </button>
                </div>
                <div className="chip-row">
                  {temasBloque.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={'chip' + (scope.has(t.id) ? ' on' : '')}
                      title={t.title}
                      onClick={() => toggleTema(t.id)}
                    >
                      {t.tema}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
