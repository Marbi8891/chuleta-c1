// src/features/flashcards/FlashcardsPage.tsx
//
// Migración de buildFlashQueue()/renderFlashView()/paintFlash()/
// advanceFlash() (legacy/index.original.html líneas 656-759). La cola de
// tarjetas y el índice actual son estado local a esta feature (igual que
// las variables de módulo `flashQueue`/`flashIndex`/`flashFlipped`/
// `hideKnown` en legacy) — nada de esto se comparte con Estudiar ni Test.
//
// La cola solo se reconstruye (con nuevo mezclado) cuando cambia el
// alcance, se activa/desactiva "ocultar dominadas", o el usuario pulsa
// "Mezclar de nuevo" / llega al final y pulsa "Volver a empezar" — igual
// que en legacy, donde marcar una tarjeta como sabida/a repasar solo avanza
// el índice (advanceFlash) sin reconstruir la cola.
//
// Fase 2B punto 3: `buildQueue` lee `known` con `getState()` (lectura
// directa del store, no reactiva) en vez de con el hook `useAppState()`.
// Con el hook, `buildQueue` (memoizada con `useCallback`) capturaba en su
// cierre el `known` del último render en el que se había recalculado —
// que, tras `resetKnownFor()` seguido síncronamente de `restart()` en
// `handleResetKnown()`, todavía era el snapshot ANTERIOR al reset (React
// no ha vuelto a renderizar todavía en ese punto). Resultado: "Reiniciar
// dominadas" no siempre devolvía las tarjetas recién reiniciadas a la cola
// cuando "ocultar dominadas" estaba activo. `getState()` siempre devuelve
// el estado actual del store en el momento de la llamada, sin ese desfase.
// No se usa `useAppState()` en ningún otro punto de este componente, así
// que se elimina del todo (evita además una suscripción/rerender que no
// hacía falta).

import { useCallback, useEffect, useState } from 'react';
import { getFlashcards } from '../../data/index';
import type { Flashcard } from '../../types/flashcard';
import { useScope } from '../../app/ScopeContext';
import { shuffle } from '../../app/QuizContext';
import { getState, resetKnownFor, setKnown } from '../../state/appState';
import { renderBold, renderCloze } from './textFormat';

export function FlashcardsPage() {
  const { scope } = useScope();
  const [hideKnown, setHideKnown] = useState(false);
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const buildQueue = useCallback((): Flashcard[] => {
    let pool = getFlashcards().filter((c) => scope.has(c.id_tema));
    if (hideKnown) {
      const known = getState().known;
      pool = pool.filter((c) => !known[c.id]);
    }
    return shuffle(pool);
  }, [scope, hideKnown]);

  const restart = useCallback(() => {
    setQueue(buildQueue());
    setIndex(0);
    setFlipped(false);
  }, [buildQueue]);

  // Igual que renderFlashView() al cambiar de modo o tocar alcance: reconstruye y mezcla.
  useEffect(() => {
    restart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, hideKnown]);

  if (scope.size === 0) {
    return <div className="empty-note">Selecciona al menos un tema en «Alcance» para repasar sus flashcards.</div>;
  }
  if (queue.length === 0) {
    return (
      <div className="empty-note">
        No quedan flashcards pendientes en este alcance. Desactiva «ocultar dominadas» o marca de nuevo temas en
        Alcance.
      </div>
    );
  }
  if (index >= queue.length) {
    return (
      <div className="empty-note">
        Has repasado las {queue.length} flashcards de esta tanda.
        <br />
        <br />
        <button type="button" className="btn-primary" onClick={restart}>
          Volver a empezar
        </button>
      </div>
    );
  }

  const card = queue[index]!;
  const pct = Math.round((index / queue.length) * 100);

  function advance() {
    setIndex((i) => i + 1);
    setFlipped(false);
  }

  function handleReview() {
    setKnown(card.id, false);
    advance();
  }
  function handleKnown() {
    setKnown(card.id, true);
    advance();
  }
  function handleResetKnown() {
    const idsInScope = getFlashcards().filter((c) => scope.has(c.id_tema)).map((c) => c.id);
    resetKnownFor(idsInScope);
    restart();
  }

  return (
    <>
      <div className="flash-meta">
        <span className="flash-progress-txt">
          Tarjeta {index + 1} / {queue.length}
        </span>
        <label className="flash-toggle">
          <input
            type="checkbox"
            checked={hideKnown}
            onChange={(e) => setHideKnown(e.target.checked)}
          />
          Ocultar dominadas
        </label>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="card-scene">
        <button
          type="button"
          className={'flip-card' + (flipped ? ' flipped' : '')}
          aria-label={flipped ? 'Mostrando respuesta, toca para volver a la pregunta' : 'Toca para revelar la respuesta'}
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="flip-face front">
            <span className="punch" />
            <div className="face-topline">
              <span className="tema-badge">{card.id_tema}</span>
              <span className="face-hint">Toca para revelar</span>
            </div>
            <div className="face-body">
              <p>{renderCloze(card.front)}</p>
            </div>
            <div className="face-tema-title">{card.temaTitle}</div>
          </div>
          <div className="flip-face back">
            <span className="punch" />
            <div className="face-topline">
              <span className="tema-badge">{card.id_tema}</span>
              <span className="face-hint">Respuesta</span>
            </div>
            <div className="face-body">
              <p>{renderBold(card.back)}</p>
            </div>
            <div className="face-tema-title">{card.temaTitle}</div>
          </div>
        </button>
      </div>
      <div className="flash-actions">
        <button type="button" className="act-btn review" onClick={handleReview}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 12a9 9 0 0 1 15.3-6.4M21 12a9 9 0 0 1-15.3 6.4M3 4v5h5M21 20v-5h-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          A repasar
        </button>
        <button type="button" className="act-btn known" onClick={handleKnown}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Lo sé
        </button>
      </div>
      <div className="flash-sub-actions">
        <button type="button" className="link-btn" onClick={restart}>
          Mezclar de nuevo
        </button>
        <button type="button" className="link-btn" onClick={handleResetKnown}>
          Reiniciar dominadas de este alcance
        </button>
      </div>
    </>
  );
}
