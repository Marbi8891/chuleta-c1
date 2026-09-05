// src/app/AppLayout.tsx
//
// Shell de nivel superior: cabecera, estadísticas, alcance, contenido de ruta,
// footer, navegación inferior y menú lateral. El selector de Alcance solo
// aparece donde modifica realmente la experiencia (Test y Repaso); no se
// muestra en Hoy, Estudiar ni Más, para que cada destino sea visual y
// funcionalmente claro.

import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SideMenu } from './SideMenu';
import { ScopePanel } from './ScopePanel';
import { StatsStrip } from './StatsStrip';
import { OfflineIndicator } from '../pwa/OfflineIndicator';
import { UpdateBanner } from '../pwa/UpdateBanner';

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
  const showScope =
    location.pathname === '/quiz' ||
    location.pathname.startsWith('/quiz/') ||
    location.pathname === '/flashcards';

  return (
    <div className="wrap app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div>
            <div className="brand-title-row">
              <h1>
                Chuleta <span className="accent">C1</span>
              </h1>
              <SideMenu />
            </div>
            <p className="subtitle">Cuerpo General Administrativo del Estado</p>
          </div>
        </div>
        <div className="topbar-actions">
          <OfflineIndicator />
        </div>
      </header>

      <UpdateBanner />
      <StatsStrip />
      <ScopePanel hidden={!showScope} />

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
