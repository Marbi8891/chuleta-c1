// src/pwa/OfflineIndicator.tsx
//
// Fase 4, punto 7. Indicador discreto y accesible de "sin conexión":
// - aria-live="polite" en un contenedor SIEMPRE presente en el DOM (nunca
//   se monta/desmonta el propio live region) — así los lectores de
//   pantalla anuncian el cambio de estado; si el nodo apareciera y
//   desapareciera del DOM, algunos lectores no llegan a anunciarlo.
// - No bloquea ni superpone contenido: es una línea de texto en el flujo
//   normal del topbar (ver AppLayout.tsx), no un overlay ni un modal.
// - No implica pérdida de datos: el texto es deliberadamente neutro
//   ("Sin conexión") y nunca menciona progreso/guardado — eso es
//   responsabilidad exclusiva de QuizContext (saveError) y de
//   PersistenceGate, que son estados independientes.
// - Desaparece (queda vacío, pero el live region sigue montado) en cuanto
//   vuelve la conexión.

import { useOnlineStatus } from './useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  return (
    <p className="offline-indicator" aria-live="polite">
      {!isOnline && <span className="offline-pill">Sin conexión</span>}
    </p>
  );
}
