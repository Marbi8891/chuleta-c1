// src/app/App.test.tsx
//
// Tests mínimos de Fase 2 para la navegación de la app: la bottom-nav
// funciona y una ruta inválida cae en la página "no encontrada".

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScopeProvider } from './ScopeContext';
import { QuizProvider } from './QuizContext';
import { AppRouter } from './router';

function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScopeProvider>
        <QuizProvider>
          <AppRouter />
        </QuizProvider>
      </ScopeProvider>
    </MemoryRouter>,
  );
}

describe('Navegación de la app', () => {
  it('arranca en Hoy y permite navegar a Temario mediante la barra inferior', async () => {
    renderApp('/');
    expect(screen.getByRole('heading', { name: 'Hoy' })).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    fireEvent.click(within(nav).getByRole('link', { name: /Temario/ }));
    // Fase 4, punto 9: StudyHomePage se carga con React.lazy (ver
    // src/app/router.tsx) — tras el click, React pinta primero el
    // fallback de Suspense ("Cargando…") y resuelve el chunk de forma
    // asíncrona incluso en test (import() real, aunque ya esté en la
    // caché de módulos de Vitest). findByText espera a esa resolución.
    expect(await screen.findByText(/Elige un tema para leerlo/)).toBeInTheDocument();
  });

  it('una ruta inválida muestra la página de "no encontrada"', () => {
    renderApp('/esto-no-existe');
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });
});
