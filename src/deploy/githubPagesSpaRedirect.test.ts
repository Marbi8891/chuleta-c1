// src/deploy/githubPagesSpaRedirect.test.ts
//
// Cubre el truco de GitHub Pages para rutas de cliente sin navegador real:
// codificar una URL pedida (como la vería 404.html) y decodificarla de
// vuelta (como lo hace src/main.tsx) debe reconstruir exactamente la ruta
// original, para las rutas reales de la app (incluida study/:topicId con
// un id compuesto tipo "I-T01").

import { describe, expect, it } from 'vitest';
import { decodeRedirectUrl, encodeRedirectUrl } from './githubPagesSpaRedirect';

function loc(pathname: string, search = '', hash = '') {
  return { pathname, search, hash };
}

describe('encodeRedirectUrl', () => {
  it('mueve la ruta bajo la base del proyecto a un querystring "?/..."', () => {
    expect(encodeRedirectUrl(loc('/chuleta-c1/study/I-T01'), 1)).toBe('/chuleta-c1/?/study/I-T01');
  });

  it('conserva la query original escapando los "&" como "~and~"', () => {
    expect(encodeRedirectUrl(loc('/chuleta-c1/quiz', '?a=1&b=2'), 1)).toBe(
      '/chuleta-c1/?/quiz&a=1~and~b=2',
    );
  });

  it('conserva el hash', () => {
    expect(encodeRedirectUrl(loc('/chuleta-c1/study', '', '#section'), 1)).toBe(
      '/chuleta-c1/?/study#section',
    );
  });

  it('la raíz del sitio se codifica sin resto', () => {
    expect(encodeRedirectUrl(loc('/chuleta-c1/'), 1)).toBe('/chuleta-c1/?/');
  });
});

describe('decodeRedirectUrl', () => {
  it('devuelve null si la URL no lleva la marca de redirección', () => {
    expect(decodeRedirectUrl(loc('/chuleta-c1/study/I-T01'))).toBeNull();
    expect(decodeRedirectUrl(loc('/chuleta-c1/', '?foo=bar'))).toBeNull();
  });

  it('reconstruye la ruta real a partir del querystring de redirección', () => {
    expect(decodeRedirectUrl(loc('/chuleta-c1/', '?/study/I-T01'))).toBe('/chuleta-c1/study/I-T01');
  });

  it('reconstruye query y hash originales', () => {
    expect(decodeRedirectUrl(loc('/chuleta-c1/', '?/quiz&a=1~and~b=2'))).toBe(
      '/chuleta-c1/quiz?a=1&b=2',
    );
    expect(decodeRedirectUrl(loc('/chuleta-c1/', '?/study#section'))).toBe(
      '/chuleta-c1/study#section',
    );
  });
});

describe('round-trip para todas las rutas reales de la app', () => {
  const ROUTES = ['/chuleta-c1/', '/chuleta-c1/study', '/chuleta-c1/study/I-T01', '/chuleta-c1/quiz', '/chuleta-c1/quiz/run', '/chuleta-c1/quiz/results', '/chuleta-c1/flashcards'];

  it.each(ROUTES)('encode → decode reconstruye %s exactamente', (pathname) => {
    const encoded = encodeRedirectUrl(loc(pathname), 1);
    const questionMarkIndex = encoded.indexOf('?');
    const redirectedPathname = encoded.slice(0, questionMarkIndex);
    const redirectedSearch = encoded.slice(questionMarkIndex);
    const decoded = decodeRedirectUrl(loc(redirectedPathname, redirectedSearch));
    expect(decoded).toBe(pathname);
  });
});
