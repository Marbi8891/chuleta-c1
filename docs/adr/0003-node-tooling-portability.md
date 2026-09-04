# ADR-0003: Portabilidad del tooling de Node (nada de scripts depende de TypeScript nativo)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

`scripts/lib/validate.mjs` importaba `../../src/data/ids.ts` directamente.
Eso funcionaba en el Node de desarrollo (22.x, con type-stripping nativo de
TypeScript activado por defecto), pero es una dependencia implícita
frágil: no todas las versiones de Node usadas habitualmente para
tooling/CI soportan importar `.ts` sin flags, y el propio comportamiento
por defecto ha cambiado entre versiones de Node 22.x. Un pipeline de
integridad de contenido no debería depender de un detalle de versión de
Node que nadie recuerda documentar.

## Decisión

**Una sola implementación de `buildQuestionId`, en JavaScript plano:**
`src/data/ids.impl.mjs`. Todo el tooling de Node (`scripts/lib/validate.mjs`,
`scripts/lib/diff.mjs`, los tests) importa este archivo directamente — nunca
un `.ts`.

`src/data/ids.ts` pasa a ser un envoltorio fino sin lógica propia: importa
`ids.impl.mjs` y re-exporta con tipos (`TemaId` en vez de `string`), para
que el futuro código React/Vite tenga tipos completos. Los tipos de
`ids.impl.mjs` en sí los aporta `src/data/ids.impl.d.mts`, un fichero de
declaración hermano — TypeScript lo empareja automáticamente con el `.mjs`
del mismo nombre, así que `ids.ts` no pierde tipado por reexportar un
módulo "sin tipos".

Se optó por esto en vez de añadir `tsx` (la otra opción razonable que se
barajó) porque no introduce ninguna dependencia nueva, y el propio
`buildQuestionId` es lo bastante simple (un padStart y dos validaciones)
como para que "escribirlo en JS con JSDoc" no suponga ninguna pérdida real
frente a escribirlo en TS — la complejidad de tooling que evita (una
dependencia de compilación en cada `npm test`) pesa más que la comodidad
de sintaxis TS nativa en un archivo de 40 líneas.

## Verificación

Se comprobó explícitamente ejecutando todo el pipeline con
`--no-experimental-strip-types` (desactivando a propósito el soporte nativo
de TS de Node, para simular una versión de Node sin esa capacidad):

```
node --no-experimental-strip-types scripts/verify-content.mjs   → EXIT 0
node --no-experimental-strip-types --test tests/*.test.mjs      → 27/27 PASS
```

## Consecuencias

- `engines.node` en `package.json` se fija en `>=22.0.0` (el requisito real
  pasa a ser soporte de ESM + `node:test` + `node:crypto`, no
  type-stripping — Node 20 dejó de ser el mínimo por quedar EOL, no por
  ninguna dependencia técnica nueva). `.nvmrc` pin la versión recomendada
  de desarrollo, `24` (LTS), dentro de ese rango — no hace falta que
  coincidan exactamente: `engines` es el mínimo soportado, `.nvmrc` es la
  versión que usa este proyecto por defecto si tienes varias instaladas.
- `npm install && npm run check` funciona sin `NODE_OPTIONS` ni flags
  manuales, en cualquier Node moderno.
- Si en el futuro se necesita lógica más compleja compartida entre Node y
  React, el patrón a seguir es el mismo: implementación única en `.mjs` (o
  `.js`) plano con JSDoc, envoltorio `.ts` fino donde haga falta tipado
  fuerte del lado de la app. No duplicar lógica en dos archivos.
