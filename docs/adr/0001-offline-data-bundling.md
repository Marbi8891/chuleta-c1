# ADR-0001: Bundling offline del contenido (import JSON vs fetch de assets)

- **Estado:** Decidido
- **Fecha:** 2026-09-04

## Contexto

La app Android (Capacitor) debe funcionar en modo avión. El contenido
académico (25 temas, 25 bancos de test, 165 flashcards — ~590 KB de JSON en
total) tiene que estar disponible sin red desde el primer arranque, no solo
tras una primera sincronización.

Dos opciones sobre la mesa:

- **A) Importar el JSON desde TypeScript** (`import studyBank from
  './study_bank.json'`), dejando que Vite lo inline en el bundle JS en
  build time.
- **B) Servir los JSON como assets estáticos** en `public/`, cargados en
  runtime vía `fetch('/data/study_bank.json')`.

## Decisión

**Opción A: import de JSON como módulo ES**, a través de la capa de acceso
centralizada en `src/data/index.ts` (ver también el propio `index.ts`, que
documenta esto mismo en su cabecera).

## Razón

- Con la opción B, el primer arranque en modo avión (o con la app recién
  instalada y sin haber tenido nunca red) tendría que servir esos assets
  desde el propio paquete Android igualmente — Capacitor sirve `public/`
  vía un servidor local embebido, así que en la práctica *también* sería
  "local", pero añade una petición `fetch` asíncrona, un estado de carga,
  y una superficie de fallo (parseo, 404 si el asset no se copió al build)
  que la opción A no tiene.
- Con la opción A, el contenido es parte del grafo de módulos: si falta o
  está corrupto, el build falla en compilación, no en runtime en el móvil
  de un usuario.
- El dataset es pequeño (~590 KB sin comprimir) para los estándares de un
  bundle de app móvil: no justifica la complejidad de carga diferida.

## Trade-offs

- El contenido queda "horneado" en el binario de la app: actualizar temario
  requiere una nueva build/versión, no un simple reemplazo de archivo. Esto
  es aceptable porque el alcance actual no incluye actualización de
  contenido over-the-air; si se necesitara en el futuro, sería un cambio de
  arquitectura explícito (ADR nuevo), no una corrección de esta decisión.
- El bundle JS inicial es más grande (~590 KB extra sin gzip). Con Capacitor
  esto no afecta al tiempo de "descarga" (la app ya está instalada), solo
  marginalmente al tiempo de parseo en el arranque — no medido todavía,
  pendiente de verificar cuando exista el shell React.

## Consecuencias

- `src/data/index.ts` es el único punto de import de los JSON. Ningún
  componente de `src/features/` debe importar `study_bank.json` /
  `quiz_bank.json` / `flashcards.json` directamente.
- Si en el futuro se decide mover a carga diferida o actualización remota
  de contenido, el cambio queda contenido en `src/data/index.ts` (las
  funciones `getTopics()`, `getQuestionsByTopic()`, etc. no cambian de
  forma), sin tocar `src/features/`.
