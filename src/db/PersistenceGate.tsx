// src/db/PersistenceGate.tsx
//
// Espera a que IndexedDB esté abierta y la migración legacy (si procede)
// haya terminado antes de montar el resto de la app — así ningún
// componente lee "0 temas leídos" un instante para luego sustituirlo por
// el progreso real (ver STARTUP en la especificación de Fase 3).
//
// No bloquea indefinidamente: si `db.open()` falla, se muestra un mensaje
// comprensible (sin stack trace) y se deja de esperar.

import { useEffect, useState, type ReactNode } from 'react';
import { db } from './db';
import { runLegacyMigration } from './legacyMigration';

type GateState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

export function PersistenceGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await db.open();
        const result = await runLegacyMigration(db);
        if (
          result.status === 'invalid-legacy-data' ||
          result.status === 'migration-failed' ||
          result.status === 'storage-unavailable'
        ) {
          // No es un error fatal: IndexedDB está operativa, solo no se pudo
          // importar el progreso legacy (datos corruptos, transacción
          // revertida, o localStorage momentáneamente inaccesible — Fase
          // 3B, punto 2). La app sigue siendo usable — ya se registró en
          // consola dentro de runLegacyMigration — y se reintentará en el
          // próximo arranque (no se marcó como completada).
          console.warn('[PersistenceGate] progreso legacy no migrado:', result.status, result.reason);
        }
        if (!cancelled) setState({ status: 'ready' });
      } catch (e) {
        console.error('[PersistenceGate] no se pudo abrir el almacenamiento local.', e);
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'No se ha podido abrir el almacenamiento local de Chuleta C1.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="persistence-gate-loading" role="status" aria-live="polite">
        Cargando tu progreso…
      </div>
    );
  }

  if (state.status === 'error') {
    // Bloqueante a propósito (no un "modo degradado"): toda la app depende
    // de Dexie para leer/guardar progreso (ver REACT INTEGRATION en la
    // especificación de Fase 3) — renderizar el resto igualmente solo
    // produciría fallos silenciosos en cada acción. "No implementar
    // todavía un sistema complejo de recuperación" (especificación,
    // INDEXEDDB FAILURE): esto es deliberadamente simple.
    return (
      <div className="persistence-gate-error" role="alert">
        <p>{state.message}</p>
        <p>Prueba a recargar la página. Si el problema persiste, puede deberse a que el navegador tiene bloqueado el almacenamiento local (p. ej. modo privado).</p>
      </div>
    );
  }

  return <>{children}</>;
}
