// src/pwa/UpdateBanner.tsx
//
// Fase 4, punto 6. UI mínima deliberada ("no elaborate updater UI
// needed", literal de la especificación): un texto y un botón. Ningún
// modal, ninguna cuenta atrás, ningún cierre automático.
//
// Se separa en dos piezas para poder testear la lógica de forma
// determinista sin depender del módulo virtual 'virtual:pwa-register/react'
// (que solo existe con el plugin de Vite activo, no en el entorno de
// test — ver useServiceWorkerUpdate.ts):
//   - `UpdateBannerView`: componente puro, recibe `needRefresh` y
//     `onUpdate` como props. Esto es lo que cubren los tests (Fase 4,
//     punto 11, "update-available UI logic" y "safe update behavior
//     while quiz is active").
//   - `UpdateBanner`: el que se monta de verdad en AppLayout, conecta
//     `UpdateBannerView` con el hook real.
//
// Importante (Fase 4, punto 6): este componente NUNCA llama a
// `updateServiceWorker()` por su cuenta — solo lo hace `onUpdate`, que se
// invoca exclusivamente desde el `onClick` del botón. No hay ningún
// `useEffect` aquí que reaccione a `needRefresh` recargando la página. Si
// hay una pregunta de test a medio responder cuando aparece este banner,
// se queda ahí, intacta, hasta que el usuario decida pulsar "Actualizar"
// — y en ese momento la decisión es suya, no de la app.

import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

export interface UpdateBannerViewProps {
  needRefresh: boolean;
  onUpdate: () => void;
}

export function UpdateBannerView({ needRefresh, onUpdate }: UpdateBannerViewProps) {
  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="status" aria-live="polite">
      <span>Nueva versión disponible</span>
      <button type="button" className="update-banner-btn" onClick={onUpdate}>
        Actualizar
      </button>
    </div>
  );
}

export function UpdateBanner() {
  const { needRefresh, updateServiceWorker } = useServiceWorkerUpdate();
  return <UpdateBannerView needRefresh={needRefresh} onUpdate={() => void updateServiceWorker()} />;
}
