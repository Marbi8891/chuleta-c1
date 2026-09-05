import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { decodeRedirectUrl } from './deploy/githubPagesSpaRedirect';
import './theme/tokens.css';
import './theme/global.css';
import './theme/app.css';
import './theme/sideMenu.css';

// Si la carga viene de la redirección de 404.html (deep-link o refresco en
// GitHub Pages — ver src/deploy/githubPagesSpaRedirect.ts), reconstruye la
// ruta real ANTES de montar React, para que BrowserRouter la vea desde el
// primer render.
const restoredUrl = decodeRedirectUrl(window.location);
if (restoredUrl) {
  window.history.replaceState(null, '', restoredUrl);
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
