// src/app/App.test.tsx
//
// Tests de navegación principal: destinos de la bottom-nav, menú lateral,
// visibilidad del Alcance por ruta y fallback 404.

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
    expect(await screen.findByText(/Elige un tema para leerlo/)).toBeInTheDocument();
  });

  it('el menú lateral abre, navega al historial y se cierra al cambiar de ruta', async () => {
    renderApp('/');

    const trigger = screen.getByRole('button', { name: 'Abrir menú lateral' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Menú lateral' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const menu = screen.getByRole('navigation', { name: 'Menú lateral' });
    fireEvent.click(within(menu).getByRole('link', { name: /Historial/ }));

    expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menú lateral' })).not.toBeInTheDocument();
  });

  it('el menú lateral se puede cerrar con Escape', () => {
    renderApp('/');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menú lateral' }));
    expect(screen.getByRole('dialog', { name: 'Menú lateral' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menú lateral' })).not.toBeInTheDocument();
  });

  it('Test muestra su contenido propio y el selector de Alcance arranca plegado', async () => {
    renderApp('/quiz');
    expect(await screen.findByRole('heading', { name: 'Configura tu test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alcance/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('Más es un destino navegable, muestra el historial y no muestra el selector de Alcance', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
    fireEvent.click(within(nav).getByRole('link', { name: /Más/ }));

    expect(await screen.findByRole('heading', { name: 'Más' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Historial de tests' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Alcance/ })).not.toBeInTheDocument();
  });

  it('una ruta inválida muestra la página de "no encontrada"', () => {
    renderApp('/esto-no-existe');
    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });
});
