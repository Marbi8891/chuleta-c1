// src/features/study/Study.test.tsx
//
// Tests mínimos de Fase 2 para Estudiar (sin snapshots, sin copiar el
// temario a una fixture aparte: usan el contenido real ya empaquetado).

import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { StudyHomePage } from './StudyHomePage';
import { StudyArticlePage } from './StudyArticlePage';
import { getTemasOrdered } from '../../data/topics';

function StudyRoutes() {
  return (
    <Routes>
      <Route path="/study" element={<StudyHomePage />} />
      <Route path="/study/:topicId" element={<StudyArticlePage />} />
    </Routes>
  );
}

describe('Estudiar', () => {
  it('lista todos los temas cargados', () => {
    renderWithProviders(<StudyRoutes />, { route: '/study' });
    const temas = getTemasOrdered();
    // t.tema (ej. "T01") solo es único dentro de su bloque, no en toda la
    // página (cada bloque reinicia su numeración) — por eso se comprueba el
    // número total de filas en vez de un código de tema concreto.
    expect(screen.getAllByRole('link')).toHaveLength(temas.length);
    expect(screen.getByText(temas[0]!.title)).toBeInTheDocument();
  });

  it('abrir un tema navega a su artículo y muestra el título correcto', () => {
    renderWithProviders(<StudyRoutes />, { route: '/study' });
    const temas = getTemasOrdered();
    const titleSpan = screen.getByText(temas[0]!.title);
    fireEvent.click(titleSpan.closest('a')!);
    expect(screen.getByRole('heading', { level: 1, name: temas[0]!.title })).toBeInTheDocument();
  });

  it('el contenido markdown del tema se renderiza como HTML, no como texto plano', () => {
    const temas = getTemasOrdered();
    renderWithProviders(<StudyRoutes />, { route: `/study/${temas[0]!.id}` });
    const article = document.querySelector('.study-article');
    expect(article).not.toBeNull();
    expect(article!.querySelector('p, li, h2, h3, table')).not.toBeNull();
  });
});
