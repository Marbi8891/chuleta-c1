// src/features/flashcards/Flashcards.test.tsx
//
// Tests mínimos de Fase 2 para Flashcards.

import { describe, expect, it } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { FlashcardsPage } from './FlashcardsPage';
import { getFlashcards } from '../../data/index';
import { resetKnownFor } from '../../state/appState';

/** `appState` es un store a nivel de módulo (ver src/state/appState.ts):
 * persiste entre los `it()` de este fichero, así que cada test que dependa
 * de qué tarjetas están "dominadas" debe partir de un estado limpio. */
function resetAllKnown(): void {
  resetKnownFor(getFlashcards().map((c) => c.id));
}

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

  // Fase 2B punto 3 — regresión: "Reiniciar dominadas" debe devolver una
  // tarjeta recién marcada como dominada a la cola cuando "ocultar
  // dominadas" está activo, sin usar un snapshot obsoleto de `known`
  // (ver el comentario de buildQueue en FlashcardsPage.tsx).
  function totalFromProgressText(text: string | null): number {
    const match = /\/\s*(\d+)/.exec(text ?? '');
    if (!match) throw new Error(`No se pudo leer el total de "${text}"`);
    return Number(match[1]);
  }

  it('reiniciar dominadas devuelve a la cola una tarjeta ocultada por "ocultar dominadas"', () => {
    resetAllKnown();
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });

    const initialTotal = totalFromProgressText(screen.getByText(/^Tarjeta 1 \//).textContent);

    // Marcar la primera tarjeta como dominada.
    fireEvent.click(screen.getByRole('button', { name: /Lo sé/ }));

    // Activar "ocultar dominadas": la cola se reconstruye y pierde esa tarjeta.
    fireEvent.click(screen.getByRole('checkbox', { name: /Ocultar dominadas/ }));
    const totalWithHidden = totalFromProgressText(screen.getByText(/^Tarjeta 1 \//).textContent);
    expect(totalWithHidden).toBe(initialTotal - 1);

    // Reiniciar dominadas del alcance actual (con "ocultar dominadas" seguido activo):
    // la tarjeta reiniciada debe volver a estar disponible de inmediato.
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar dominadas/ }));
    const totalAfterReset = totalFromProgressText(screen.getByText(/^Tarjeta 1 \//).textContent);
    expect(totalAfterReset).toBe(initialTotal);
  });
});
