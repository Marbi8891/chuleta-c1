// src/app/ScopeContext.tsx
//
// Migración de la variable de módulo `scope` (legacy/index.original.html,
// línea 446: `let scope = new Set(TEMAS.map(t=>t.id))`) y de las funciones
// que la mutan (renderScope, los listeners de scopeAllBtn/scopeNoneBtn y del
// toggle por bloque). Igual que en legacy, el alcance NO se persiste en
// localStorage — se reinicia a "todos los temas seleccionados" en cada carga
// de la app. Se comparte entre Estudiar (para el CTA "Hacer el test"),
// Test y Flashcards, así que vive en un Context por encima de las tres
// rutas en vez de en el estado local de una sola feature.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { getTemasOrdered } from '../data/topics';
import type { BloqueId, TemaId } from '../types/content';

interface ScopeContextValue {
  scope: ReadonlySet<TemaId>;
  toggleTema: (id: TemaId) => void;
  toggleBloque: (bloqueId: BloqueId) => void;
  selectAll: () => void;
  selectNone: () => void;
  /** Sustituye el alcance completo por un único tema (equivalente a startSingleTemaQuiz). */
  setScopeToSingle: (id: TemaId) => void;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const temas = getTemasOrdered();
  const [scope, setScope] = useState<Set<TemaId>>(() => new Set(temas.map((t) => t.id)));

  const toggleTema = useCallback((id: TemaId) => {
    setScope((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleBloque = useCallback(
    (bloqueId: BloqueId) => {
      setScope((prev) => {
        const temasInBloque = temas.filter((t) => t.bloque === bloqueId);
        const allOn = temasInBloque.every((t) => prev.has(t.id));
        const next = new Set(prev);
        temasInBloque.forEach((t) => (allOn ? next.delete(t.id) : next.add(t.id)));
        return next;
      });
    },
    [temas],
  );

  const selectAll = useCallback(() => setScope(new Set(temas.map((t) => t.id))), [temas]);
  const selectNone = useCallback(() => setScope(new Set()), []);
  const setScopeToSingle = useCallback((id: TemaId) => setScope(new Set([id])), []);

  const value = useMemo<ScopeContextValue>(
    () => ({ scope, toggleTema, toggleBloque, selectAll, selectNone, setScopeToSingle }),
    [scope, toggleTema, toggleBloque, selectAll, selectNone, setScopeToSingle],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope debe usarse dentro de <ScopeProvider>');
  return ctx;
}
