// src/pwa/useServiceWorkerUpdate.ts
//
// Fase 4, punto 6 (ESTRATEGIA DE ACTUALIZACIÓN SEGURA). Envuelve
// `useRegisterSW` de 'virtual:pwa-register/react' (vite-plugin-pwa) para
// aislar el resto de la app de esa importación virtual — solo existe en
// tiempo de build/runtime real, no en el entorno de test (Vitest/jsdom no
// pasa por el plugin de Vite en modo test para módulos virtuales de esta
// forma), así que este módulo es el único punto de contacto con ella.
//
// Ciclo de vida (ver vite.config.ts, registerType: 'prompt'):
//   INSTALL   → el navegador descarga el nuevo sw.js en segundo plano,
//               sin afectar a la pestaña abierta (comportamiento nativo
//               del navegador, no configurable desde aquí).
//   WAITING   → el nuevo SW terminó de instalarse pero no toma el control
//               todavía porque el SW anterior sigue activo controlando
//               esta pestaña — vite-plugin-pwa detecta este evento
//               ('waiting') y llama a `onNeedRefresh`, que aquí solo
//               marca `needRefresh: true`. NINGÚN reload ocurre en este
//               punto — es exactamente el momento que la especificación
//               pide anunciar sin actuar.
//   ACTIVATION → solo se dispara si el usuario llama a
//               `updateServiceWorker()` (nunca automáticamente): envía
//               skipWaiting al SW en espera.
//   RELOAD    → tras la activación, vite-plugin-pwa recarga la pestaña
//               (comportamiento por defecto de la librería) para que la
//               página quede servida por el nuevo SW. Como esto SOLO
//               ocurre tras una pulsación explícita del usuario en
//               "Actualizar" (ver UpdateBanner.tsx), nunca hay una
//               recarga silenciosa que pueda tirar un test en curso sin
//               que el usuario lo haya decidido — ver
//               docs/PWA_ARCHITECTURE.md, sección "Ciclo de vida de
//               actualización".
//
// `offlineReady` (true tras el primer `install` con éxito, sin
// actualización pendiente) no se usa todavía en la UI de esta fase — se
// expone por si una fase futura quiere mostrar "Lista para usarse sin
// conexión" tras la primera visita, pero no es un requisito de la Fase 4.

import { useRegisterSW } from 'virtual:pwa-register/react';

export interface ServiceWorkerUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdateState {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();

  return { needRefresh, offlineReady, updateServiceWorker };
}
