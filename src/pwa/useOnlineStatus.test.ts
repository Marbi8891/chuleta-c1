// src/pwa/useOnlineStatus.test.ts
//
// Fase 4, punto 11. Cubre el hook de estado de red de forma determinista:
// no hay ningún Service Worker real de por medio (jsdom no lo soporta),
// así que se fuerza `navigator.onLine` y se disparan los eventos
// 'online'/'offline' a mano — exactamente lo que hace el navegador real.

import { describe, expect, it, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    setNavigatorOnLine(true);
  });

  it('arranca reflejando navigator.onLine', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('pasa a false cuando el navegador dispara "offline"', () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('vuelve a true cuando el navegador dispara "online"', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
