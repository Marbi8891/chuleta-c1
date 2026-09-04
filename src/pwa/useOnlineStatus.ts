// src/pwa/useOnlineStatus.ts
//
// Fase 4, punto 7 (OFFLINE STATUS UX). Expone únicamente el estado de RED
// del navegador (`navigator.onLine` + eventos `online`/`offline`) — nunca
// nada relacionado con Dexie/IndexedDB. Confundir "sin conexión" con "falló
// la base de datos" es exactamente el error que la especificación pide
// evitar explícitamente: son dos estados independientes y esta app los
// trata así — ver `src/db/PersistenceGate.tsx` para el fallo de
// IndexedDB, que no tiene relación alguna con este hook.
//
// `navigator.onLine` es un indicador best-effort del propio navegador (en
// algunos casos puede quedarse en `true` aunque no haya salida real a
// Internet), pero es la señal estándar y suficiente para el propósito de
// esta fase: avisar de forma no intrusiva, no bloquear nada.

import { useEffect, useState } from 'react';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
