import { useSyncExternalStore } from 'react';
import { getState, subscribe, type AppState } from './appState';

/** Suscripción reactiva al store de progreso persistente (ver appState.ts). */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
