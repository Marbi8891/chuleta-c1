// src/app/AppLayout.tsx
//
// Migración del shell de nivel superior (legacy/index.original.html líneas
// 345-394: <div class="wrap"> con <header class="topbar">, .stats-strip,
// .scope, los tres <main class="view">, y el <footer>). El header conserva
// la marca y el subtítulo; las antiguas .mode-tabs se sustituyen por la
// bottom-nav mobile-first (ver BottomNav.tsx). El panel de Alcance se oculta
// en las rutas de Estudiar, igual que `scopeBox.hidden = mode==="study"` en
// legacy — y también en "Hoy" (/), que es una landing nueva de la Fase 2 sin
// equivalente en legacy y que tampoco usa el alcance para nada.

import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { ScopePanel } from './ScopePanel';
import { StatsStrip } from './StatsStrip';

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="26" height="30" rx="3" fill="var(--surface-alt-2)" stroke="var(--border-strong)" />
      <rect x="10" y="2" width="26" height="30" rx="3" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M15 12h16M15 18h16M15 24h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function AppLayout() {
  const location = useLocation();
  const hideScope = location.pathname === '/' || location.pathname.startsWith('/study');

  return (
    <div className="wrap app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>
              Chuleta <span className="accent">C1</span>
            </h1>
            <p className="subtitle">Cuerpo General Administrativo del Estado</p>
          </div>
        </div>
      </header>

      <StatsStrip />
      <ScopePanel hidden={hideScope} />

      <main className="app-main view">
        <Outlet />
      </main>

      <footer className="page-footer">
        Material de estudio propio · generado a partir de tus resúmenes y tests del temario C1
      </footer>

      <BottomNav />
    </div>
  );
}
