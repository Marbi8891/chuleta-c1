// src/features/flashcards/Flashcards.test.tsx
//
// Tests de Fase 2 para Flashcards, adaptados en Fase 3: `known` vive en
// IndexedDB (Dexie) en vez de localStorage, así que buildQueue/handlers son
// asíncronos — se usan queries `findBy*`/`waitFor` en vez de `getBy*` allí
// donde el DOM tarda un tick en reflejar una escritura. La base Dexie de
// test se limpia automáticamente después de cada test (ver afterEach en
// src/setupTests.ts), así que no hace falta un reset manual aquí.

import { describe, expect, it } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { FlashcardsPage } from './FlashcardsPage';

describe('Flashcards', () => {
  it('carga las flashcards del alcance por defecto y muestra la cara frontal', async () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    expect(await screen.findByText(/^Tarjeta 1 \//)).toBeInTheDocument();
    const flipCard = document.querySelector('.flip-card');
    expect(flipCard).not.toBeNull();
    expect(flipCard!.querySelector('.front .face-body')?.textContent?.length).toBeGreaterThan(0);
  });

  it('al tocar la tarjeta se revela la cara trasera', async () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    await screen.findByText(/^Tarjeta 1 \//);
    const flipCard = document.querySelector('.flip-card')!;
    expect(flipCard.classList.contains('flipped')).toBe(false);
    fireEvent.click(flipCard);
    expect(flipCard.classList.contains('flipped')).toBe(true);
  });

  it('"Lo sé" avanza a la siguiente tarjeta', async () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });
    await screen.findByText(/^Tarjeta 1 \//);
    fireEvent.click(screen.getByRole('button', { name: /Lo sé/ }));
    // setFlashcardKnown() es fire-and-forget aquí (avanzar no depende de
    // Dexie) — el índice avanza de forma síncrona.
    expect(await screen.findByText(/^Tarjeta 2 \//)).toBeInTheDocument();
  });

  // Fase 2B punto 3 — regresión (adaptada a Dexie en Fase 3): "Reiniciar
  // dominadas" debe devolver una tarjeta recién marcada como dominada a la
  // cola cuando "ocultar dominadas" está activo, sin depender de una
  // lectura obsoleta de `known` (ver el comentario de buildQueue en
  // FlashcardsPage.tsx y de getKnownFlashcardIds en
  // src/db/flashcardProgress.ts).
  function totalFromProgressText(text: string | null): number {
    const match = /\/\s*(\d+)/.exec(text ?? '');
    if (!match) throw new Error(`No se pudo leer el total de "${text}"`);
    return Number(match[1]);
  }

  it('reiniciar dominadas devuelve a la cola una tarjeta ocultada por "ocultar dominadas"', async () => {
    renderWithProviders(<FlashcardsPage />, { route: '/flashcards' });

    const initialTotal = totalFromProgressText((await screen.findByText(/^Tarjeta 1 \//)).textContent);

    // Marcar la primera tarjeta como dominada.
    fireEvent.click(screen.getByRole('button', { name: /Lo sé/ }));
    await screen.findByText(/^Tarjeta 2 \//); // confirma que el write de setFlashcardKnown ya se disparó

    // Activar "ocultar dominadas": la cola se reconstruye (async) y pierde esa tarjeta.
    fireEvent.click(screen.getByRole('checkbox', { name: /Ocultar dominadas/ }));
    await waitFor(() => {
      const total = totalFromProgressText(screen.getByText(/^Tarjeta 1 \//).textContent);
      expect(total).toBe(initialTotal - 1);
    });

    // Reiniciar dominadas del alcance actual (con "ocultar dominadas" seguido activo):
    // la tarjeta reiniciada debe volver a estar disponible en cuanto termine el reset.
    fireEvent.click(screen.getByRole('button', { name: /Reiniciar dominadas/ }));
    await waitFor(() => {
      const total = totalFromProgressText(screen.getByText(/^Tarjeta 1 \//).textContent);
      expect(total).toBe(initialTotal);
    });
  });
});
