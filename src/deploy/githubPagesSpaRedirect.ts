// src/deploy/githubPagesSpaRedirect.ts
//
// Fase 2B — punto 2 (STATIC HOST / GITHUB PAGES ROUTING).
//
// GitHub Pages sirve ficheros estáticos: no sabe que "/study/I-T01" es una
// ruta de cliente de BrowserRouter, así que un deep-link o un refresco en
// esa URL le pide un fichero que no existe y responde 404 con
// `404.html` (ver 404.html en la raíz del proyecto). En vez de degradar a
// HashRouter (URLs con "#", peor para compartir enlaces y para la futura
// app de Capacitor, que también navega con rutas "normales"), se usa el
// patrón conocido como "Single Page Apps for GitHub Pages"
// (rafgraph/spa-github-pages, MIT): `404.html` reescribe la ruta pedida
// como querystring sobre `index.html`, y `index.html` la reconstruye con
// `history.replaceState` antes de montar React, para que BrowserRouter la
// vea como la ruta real.
//
// Estas dos funciones son la lógica pura de esa codificación/decodificación
// — testeable con Vitest sin navegador. `404-entry.ts` (el script que carga
// 404.html) usa encodeRedirectUrl(); src/main.tsx usa decodeRedirectUrl()
// antes de renderizar la app.

export interface LocationLike {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Reescribe la URL pedida como redirección a la raíz del sitio con la ruta
 * real codificada en el querystring.
 *
 * `segmentsToKeep` es el número de segmentos de `pathname` que forman la
 * base del despliegue (para un GitHub Pages de proyecto en
 * https://<usuario>.github.io/chuleta-c1/, la base es "/chuleta-c1" → 1
 * segmento). Los caracteres "&" del resto de la ruta y de la query se
 * escapan a "~and~" para no romper el propio querystring de redirección.
 */
export function encodeRedirectUrl(location: LocationLike, segmentsToKeep: number): string {
  const segments = location.pathname.split('/');
  const basePath = segments.slice(0, 1 + segmentsToKeep).join('/');
  const rest = segments.slice(1 + segmentsToKeep).join('/');
  const query = location.search ? '&' + location.search.slice(1).replace(/&/g, '~and~') : '';
  return `${basePath}/?/${rest.replace(/&/g, '~and~')}${query}${location.hash}`;
}

/**
 * Inverso de encodeRedirectUrl(): si la URL actual lleva la marca de
 * redirección ("?/" al principio del querystring), devuelve la URL real
 * que hay que restaurar con history.replaceState(). Si no lleva esa marca
 * (carga normal, no vino de 404.html), devuelve null y no hay que hacer
 * nada.
 */
export function decodeRedirectUrl(location: LocationLike): string | null {
  if (location.search.length < 2 || location.search[1] !== '/') return null;
  const decoded = location.search
    .slice(1)
    .split('&')
    .map((s) => s.replace(/~and~/g, '&'))
    .join('?');
  return location.pathname.slice(0, -1) + decoded + location.hash;
}
