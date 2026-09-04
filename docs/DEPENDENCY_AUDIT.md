# DEPENDENCY_AUDIT — Fase 4, punto 0 (preflight)

Auditoría de `npm audit` ejecutada antes de tocar nada de PWA, tal y como
exige la especificación de la Fase 4. **No se ha ejecutado
`npm audit fix --force`** en ningún momento — cada hallazgo se ha
clasificado y verificado manualmente contra el registro de npm antes de
decidir si actualizar o documentar.

## Resultado con el que se cierra la Fase 4

```
npm audit --omit=dev
```

```
  vulnerabilities: { moderate: 2, high: 0, critical: 0, total: 2 }
```

**Producción HIGH/CRITICAL = 0** — el objetivo obligatorio de la Fase 4
(punto 0) ya se cumple sin tocar ninguna dependencia. Los 2 hallazgos que
quedan en producción son MODERATE, no HIGH/CRITICAL.

## Clasificación completa (`npm audit` sin `--omit=dev`)

```
  vulnerabilities: { moderate: 5, high: 1, critical: 2, total: 8 }
```

| Paquete | Severidad | Directo/transitivo | Producción/dev-only | Ruta de dependencia | Versión que corrige | Riesgo de breaking change |
|---|---|---|---|---|---|---|
| `react-router-dom` | moderate | **directo** | **PRODUCCIÓN** (`dependencies`) | — | `7.18.3` | **Alto** — salto de major (v6→v7). No existe parche dentro de la serie 6.x: `6.30.6` (instalada, la última de la 6.x) sigue en el rango vulnerable `6.0.0-alpha.0 - 7.17.0` |
| `react-router` | moderate | transitivo (vía `react-router-dom`) | **PRODUCCIÓN** | `react-router-dom > react-router` | `7.18.3` (arrastrado por `react-router-dom`) | Igual que arriba — mismo paquete raíz |
| `vite` | **high** | directo | dev-only (`devDependencies`) | — | `8.2.2` | **Alto** — salto de 3 majors (5→6→7→8). `5.4.21` (instalada) es la última versión de la serie 5.4.x; no existe backport del parche a 5.x |
| `vitest` | **critical** | directo | dev-only (`devDependencies`) | — | `5.0.0` | **Alto** — salto de 3 majors (2→3→4→5). `2.1.9` (instalada) es la última de la serie 2.1.x; sin backport |
| `@vitest/ui` | **critical** | directo | dev-only (`devDependencies`) | — | `5.0.0` (arrastrado por `vitest`) | Igual que `vitest` — mismo paquete raíz. `2.1.9` instalada es la última de su serie |
| `esbuild` | moderate | transitivo (vía `vite`) | dev-only | `vite > esbuild` | arrastrado por `vite@8.2.2` | Igual que `vite` |
| `vite-node` | moderate | transitivo (vía `vitest`) | dev-only | `vitest > vite-node` | arrastrado por `vitest@5.0.0` | Igual que `vitest` |
| `@vitest/mocker` | moderate | transitivo (vía `vite`, usado por `vitest`) | dev-only | `vitest > @vitest/mocker > vite` | arrastrado por `vitest@5.0.0` | Igual que `vitest` |

## Por qué ninguno se ha actualizado en la Fase 4

**`react-router-dom`/`react-router` (producción, moderate):** el propio
`npm audit` confirma que el rango vulnerable cubre TODA la serie 6.x
(`6.0.0-alpha.0 - 7.17.0`) y que la única versión que corrige ambos
avisos (`GHSA-wrjc-x8rr-h8h6` open redirect vía backslash en
`<Link>`/`useNavigate`, `GHSA-337j-9hxr-rhxg` inyección de constructor vía
`deserializeErrors()` en hidratación SSR) es `7.18.3` — v7 no es un simple
parche, es un major nuevo. Este proyecto no usa SSR ni
`deserializeErrors()` (SPA cliente puro sobre GitHub Pages, ver
`docs/adr/0005-github-pages-deployment.md`), así que el segundo aviso no
aplica a esta app; el primero (open redirect) sí es teóricamente
relevante. Migrar a React Router v7 es un cambio de arquitectura de
routing no trivial (aunque v7 en modo "declarative" es compatible en gran
parte con la API de v6.30, exige revalidar toda la navegación,
`BrowserRouter`, y el redirect 404 de GitHub Pages) y está fuera del
alcance de "PWA offline foundation" — no se hace un cambio así de riesgo
sin que sea el objetivo explícito de la fase. **Severidad moderate, no
high/critical, así que no bloquea el objetivo obligatorio de la Fase 4.**
Se documenta aquí como deuda explícita, candidata a una fase/DECISION
REVIEW propia.

**`vite`/`vitest`/`@vitest/ui` y sus transitivas (dev-only, high/critical):**
ninguna de las tres tiene un parche disponible dentro de su serie menor
instalada — se comprobó contra el registro de npm que `vite@5.4.21` y
`vitest@2.1.9`/`@vitest/ui@2.1.9` son ya las últimas versiones de sus
respectivas series (`5.4.x`, `2.1.x`); el único fix es saltar varios
majors (`vite` 5→8, `vitest` 2→5). Son estrictamente herramientas de
desarrollo: `vite`/`esbuild` solo corren en `npm run dev` y como parte del
propio `npm run build` (no se incluyen en el `dist/` resultante — el
bundle final es solo el código de la app, ver `dist/assets/*.js`);
`vitest`/`@vitest/ui`/`vite-node`/`@vitest/mocker` solo corren en
`npm run test`. Ninguna línea de código de estos paquetes llega al
usuario final. Forzar tres saltos de major en la infraestructura de build
y de tests, sin que ese sea el objetivo de esta fase, introduciría un
riesgo real de romper `npm run check` completo a cambio de cerrar un
aviso que nunca se ejecuta en producción — se documenta explícitamente en
vez de esconderlo, tal y como exige la especificación.

## ESLint: aviso de "no longer supported"

```
npm warn deprecated eslint@9.39.5: This version is no longer supported.
```

No es un hallazgo de `npm audit` (no aparece en ninguna lista de
vulnerabilidades) — es un aviso de fin de ventana de soporte de ESLint
como proyecto. Verificado contra el registro: `eslint@9.39.5` es
exactamente la versión que ESLint mantiene con el dist-tag `maintenance`
(la última parcheada de la serie 9.x); la serie soportada activamente es
la 10.x (`dist-tag latest = 10.10.0`). Migrar a ESLint 10 implica
revisar la configuración flat (`eslint.config.js`), posibles cambios de
reglas y plugins compatibles — una migración de major no trivial. La
propia especificación de la Fase 4 indica explícitamente "no realizar una
migración major de ESLint salvo que sea necesario"; como no hay ninguna
vulnerabilidad de seguridad detrás de este aviso (es solo fin de
mantenimiento, no un CVE), se documenta y se deja para una fase futura
dedicada en vez de mezclarla con el trabajo de PWA.

## Resumen para el checkpoint final

- **production critical**: 0
- **production high**: 0
- **production moderate (no bloqueante, documentado)**: 2 (`react-router`, `react-router-dom`)
- **dev-only high/critical (no bloqueante, sin parche disponible sin major, documentado)**: `vite` (high), `vitest` (critical), `@vitest/ui` (critical), más 3 transitivas moderate (`esbuild`, `vite-node`, `@vitest/mocker`)
- **`package-lock.json`**: sin cambios — no había ninguna actualización segura y no-breaking que aplicar
- **`npm audit fix --force`**: NO ejecutado, en ningún momento
