// src/deploy/404-entry.ts
//
// Punto de entrada de 404.html (ver ese fichero y
// src/deploy/githubPagesSpaRedirect.ts para el porqué). GitHub Pages carga
// este script cuando alguien pide una ruta de cliente que no es un fichero
// real (deep-link o refresco en /study/I-T01, /quiz/run, etc.); reescribe
// esa URL como redirección a index.html y navega — index.html la
// reconstruye antes de montar React (ver src/main.tsx).

import { encodeRedirectUrl } from './githubPagesSpaRedirect';

// "/chuleta-c1" es la base del despliegue en GitHub Pages (proyecto
// Marbi8891/chuleta-c1 → https://marbi8891.github.io/chuleta-c1/) — 1 solo
// segmento de ruta antes de las rutas de cliente de la app.
const SEGMENTS_TO_KEEP = 1;

window.location.replace(encodeRedirectUrl(window.location, SEGMENTS_TO_KEEP));
