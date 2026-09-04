// src/features/flashcards/textFormat.tsx
//
// Migración de clozeify()/boldify() (legacy/index.original.html líneas
// 763-770). En legacy hacía falta escapeHtml() porque el resultado se
// inyectaba con innerHTML; en JSX el texto ya se escapa automáticamente, así
// que estas funciones solo se ocupan de partir el texto e insertar los
// nodos <span class="cloze"> / <strong> equivalentes.

import type { ReactNode } from 'react';

/** Resalta el hueco "______" de una cloze, igual que clozeify(). */
export function renderCloze(text: string): ReactNode[] {
  const parts = text.split('______');
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      nodes.push(
        <span className="cloze" key={`cloze-${i}`}>
          ______
        </span>,
      );
    }
    if (part) nodes.push(<span key={`t-${i}`}>{part}</span>);
  });
  return nodes;
}

/** Interpreta **negrita** como <strong>, igual que boldify(). */
export function renderBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, i) => {
    const match = /^\*\*(.+?)\*\*$/.exec(part);
    if (match) return <strong key={i}>{match[1]}</strong>;
    return <span key={i}>{part}</span>;
  });
}
