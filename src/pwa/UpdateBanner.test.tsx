// src/pwa/UpdateBanner.test.tsx
//
// Fase 4, punto 11. Cubre `UpdateBannerView` (la pieza pura, ver el
// comentario de cabecera en UpdateBanner.tsx) — no monta el hook real
// `useServiceWorkerUpdate` porque este depende del módulo virtual
// 'virtual:pwa-register/react', que solo existe con el plugin de Vite
// activo, no en este entorno de test.
//
// El caso obligatorio de la Fase 4, punto 6 ("safe update behavior while
// quiz is active") se traduce, a nivel de este componente, en una
// garantía estructural comprobable: `onUpdate` NUNCA se invoca salvo por
// una pulsación explícita del botón — ni al montar, ni al re-renderizar
// con `needRefresh: true`, ni en ningún efecto. Como QuizContext no
// depende en absoluto de este componente (no hay ningún listener global
// de "needRefresh" que dispare un reload), esa garantía es suficiente:
// una pregunta a medio responder nunca puede perderse por una
// actualización que el usuario no ha pedido.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdateBannerView } from './UpdateBanner';

describe('UpdateBannerView', () => {
  it('needRefresh=false: no renderiza nada (ni el botón ni el aviso)', () => {
    const onUpdate = vi.fn();
    const { container } = render(<UpdateBannerView needRefresh={false} onUpdate={onUpdate} />);
    expect(container).toBeEmptyDOMElement();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('needRefresh=true: muestra el aviso y el botón, sin llamar a onUpdate por su cuenta', () => {
    const onUpdate = vi.fn();
    render(<UpdateBannerView needRefresh={true} onUpdate={onUpdate} />);
    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    // Ni montar ni pintar el aviso dispara la actualización — solo un
    // clic explícito puede hacerlo (comprobado a continuación).
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('pulsar "Actualizar" llama a onUpdate exactamente una vez', () => {
    const onUpdate = vi.fn();
    render(<UpdateBannerView needRefresh={true} onUpdate={onUpdate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('SAFE UPDATE DURING ACTIVE QUIZ (Fase 4, punto 6): needRefresh puede activarse en cualquier momento sin que eso, por sí solo, dispare ninguna actualización', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(<UpdateBannerView needRefresh={false} onUpdate={onUpdate} />);
    // Simula que llega una actualización a mitad de una sesión (p. ej.
    // durante un test en curso): needRefresh pasa a true por un
    // re-render, no por una acción del usuario.
    rerender(<UpdateBannerView needRefresh={true} onUpdate={onUpdate} />);
    expect(screen.getByText('Nueva versión disponible')).toBeInTheDocument();
    // El simple hecho de que haya una actualización disponible no ha
    // recargado ni activado nada — sigue sin haber ninguna llamada.
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
