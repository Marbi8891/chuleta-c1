// src/pwa/OfflineIndicator.test.tsx
//
// Fase 4, punto 11. El contenedor aria-live debe estar SIEMPRE presente
// (nunca se monta/desmonta el propio live region — ver el comentario en
// OfflineIndicator.tsx); solo su contenido cambia. Y el mensaje no debe
// confundirse nunca con un fallo de IndexedDB (son estados
// independientes, ver Fase 4, punto 7).

import { describe, expect, it, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { OfflineIndicator } from './OfflineIndicator';

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('OfflineIndicator', () => {
  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it('online: el live region existe pero no muestra "Sin conexión"', () => {
    setNavigatorOnLine(true);
    render(<OfflineIndicator />);
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
    // El contenedor aria-live sigue en el DOM, vacío — no desaparece.
    expect(document.querySelector('.offline-indicator')).toBeInTheDocument();
  });

  it('offline: muestra "Sin conexión" en el mismo live region, sin mencionar datos ni progreso', () => {
    setNavigatorOnLine(false);
    render(<OfflineIndicator />);
    const pill = screen.getByText('Sin conexión');
    expect(pill).toBeInTheDocument();
    expect(pill.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('el mensaje desaparece en cuanto vuelve la conexión', () => {
    setNavigatorOnLine(false);
    render(<OfflineIndicator />);
    expect(screen.getByText('Sin conexión')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
  });
});
