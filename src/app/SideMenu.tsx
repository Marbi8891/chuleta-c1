import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const MENU_ITEMS = [
  { to: '/', label: 'Hoy', description: 'Tu punto de partida', end: true },
  { to: '/study', label: 'Temario', description: 'Leer y marcar temas' },
  { to: '/quiz', label: 'Test', description: 'Practicar preguntas' },
  { to: '/flashcards', label: 'Repaso', description: 'Trabajar con flashcards' },
  { to: '/more', label: 'Historial', description: 'Resultados y progreso' },
] as const;

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SideMenu() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Cualquier navegación cierra el drawer para no dejar una capa abierta
  // sobre el nuevo destino, tanto en móvil como en escritorio.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Mientras el menú está abierto bloqueamos el scroll de fondo y permitimos
  // cerrarlo con Escape. Se restaura exactamente el valor previo al cerrar.
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="side-menu-trigger"
        aria-label="Abrir menú lateral"
        aria-expanded={open}
        aria-controls="side-menu-panel"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>

      {open && (
        <div className="side-menu-layer">
          <button
            type="button"
            className="side-menu-backdrop"
            aria-label="Cerrar menú lateral"
            onClick={() => setOpen(false)}
          />

          <aside
            id="side-menu-panel"
            className="side-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menú lateral"
          >
            <div className="side-menu-header">
              <div>
                <span className="side-menu-eyebrow">Chuleta C1</span>
                <h2>Navegación</h2>
              </div>
              <button
                type="button"
                className="side-menu-close"
                aria-label="Cerrar menú lateral"
                onClick={() => setOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>

            <nav className="side-menu-nav" aria-label="Menú lateral">
              {MENU_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) => 'side-menu-link' + (isActive ? ' active' : '')}
                >
                  <span className="side-menu-link-label">{item.label}</span>
                  <span className="side-menu-link-description">{item.description}</span>
                </NavLink>
              ))}
            </nav>

            <div className="side-menu-footer">
              <strong>Estudio offline</strong>
              <span>Temario, tests y progreso disponibles sin conexión.</span>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
