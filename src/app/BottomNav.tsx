// src/app/BottomNav.tsx
//
// Navegación inferior mobile-first. Los cinco destinos son rutas reales:
// Hoy, Temario, Test, Repaso y Más.

import { NavLink } from 'react-router-dom';

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11l8-7 8 7M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 12.5l2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CardsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="13" height="14" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h9.4A1.8 1.8 0 0 1 21 4.8v9.4a1.8 1.8 0 0 1-1.8 1.8H18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  'bottom-nav-item' + (isActive ? ' active' : '');

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <NavLink to="/" end className={navLinkClassName}>
        <HomeIcon />
        Hoy
      </NavLink>
      <NavLink to="/study" className={navLinkClassName}>
        <BookIcon />
        Temario
      </NavLink>
      <NavLink to="/quiz" className={navLinkClassName}>
        <CheckSquareIcon />
        Test
      </NavLink>
      <NavLink to="/flashcards" className={navLinkClassName}>
        <CardsIcon />
        Repaso
      </NavLink>
      <NavLink to="/more" className={navLinkClassName}>
        <MoreIcon />
        Más
      </NavLink>
    </nav>
  );
}
