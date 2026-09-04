// src/features/flashcards/Flashcards.test.tsx
//
// Tests mínimos de Fase 2 para Flashcards.

import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { FlashcardsPage } from './FlashcardsPage';

describe('Flashcards', () => {
  it('carga las flashcards del alcance por defecto y muestra la cara frontal', () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    expect(screen.getByText(/^Tarjeta 1 \//)).toBeInTheDocument();
    const flipCard = document.querySelector('.flip-card');
    expect(flipCard).not.toBeNull();
    expect(flipCard!.querySelector('.front .face-body')?.textContent?.length).toBeGreaterThan(0);
  });

  it('al tocar la tarjeta se revela la cara trasera', () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    const flipCard = document.querySelector('.flip-card')!;
    expect(flipCard.classList.contains('flipped')).toBe(false);
    fireEvent.click(flipCard);
    expect(flipCard.classList.contains('flipped')).toBe(true);
  });

  it('"Lo sé" avanza a la siguiente tarjeta', () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    expect(screen.getByText(/^Tarjeta 1 \//)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lo sé/ }));
    expect(screen.getByText(/^Tarjeta 2 \//)).toBeInTheDocument();
  });
});
