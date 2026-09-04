# Qué copiar al repositorio real

Este proyecto se ha construido en un workspace temporal de esta sesión
(`/tmp/chuleta_build` fue solo la fuente original; el proyecto en sí vive
en un directorio de trabajo separado, `chuleta-c1/`, entregado como zip).
**No se ha inicializado ningún repositorio Git aquí a propósito** — la
instrucción de esta fase fue no tocar Git dentro de un workspace temporal,
y este lo es. La siguiente fase debe trabajar sobre tu repositorio real
`chuleta-c1` (local, o el que tengas en GitHub).

## Copiar tal cual

Todo el árbol entregado, **excepto**:

- `node_modules/` (se regenera con `npm install` — no se sube nunca)
- `.tmp/` (si existiera; es workspace transitorio del extractor)
- `package-lock.json` — cópialo también si vas a fijar versiones exactas
  de `typescript`; si prefieres que tu repo decida su propio lockfile,
  bórralo y deja que `npm install` lo regenere.

Es decir, sobre tu repo real:

```
legacy/index.original.html
scripts/extract-content.mjs
scripts/verify-content.mjs
scripts/lib/extract.mjs
scripts/lib/validate.mjs
scripts/lib/diff.mjs
src/data/ids.impl.mjs
src/data/ids.impl.d.mts
src/data/ids.ts
src/data/index.ts
src/data/study_bank.json
src/data/quiz_bank.json
src/data/flashcards.json
src/types/content.ts
src/types/study.ts
src/types/quiz.ts
src/types/flashcard.ts
tests/helpers/fixture.mjs
tests/legacy-equivalence.test.mjs
tests/pipeline.test.mjs
tests/validate.test.mjs
docs/DATA_INTEGRITY.md
docs/REPO_HANDOFF.md
docs/adr/0001-offline-data-bundling.md
docs/adr/0002-persistence-layer.md
docs/adr/0003-node-tooling-portability.md
CONTENT_INTEGRITY.json
package.json
package-lock.json   (opcional, ver arriba)
tsconfig.json
.gitignore
.nvmrc
```

## Commits sugeridos (separados, sin mezclar con React)

Si ya existe la rama `feat/react-capacitor-foundation`, continúa ahí; si
no, cualquier rama de esta fase sirve. Sugerencia de commits, en este
orden (cada uno deja el árbol en estado consistente y con
`npm run check` en verde):

1. `fix(content): block extraction on legacy hash mismatch` — SHA gate
   obligatorio antes de cualquier escritura (`scripts/extract-content.mjs`).
2. `fix(content): make extraction transactional with rollback` —
   promoción por fases (stage/backup/commit) con rollback completo ante
   fallo a mitad de la promoción, y `.tmp/content-extraction/` como único
   ámbito de limpieza.
3. `feat(content): add stable global question identifiers` —
   `src/data/ids.impl.mjs` + `src/data/ids.ts` + `src/data/ids.impl.d.mts`,
   y su consumo en `src/data/index.ts` (`getQuestions`, `getQuestionById`).
4. `feat(content): add non-regression floor independent of baseline` —
   `CONTENT_INTEGRITY.json → nonRegressionFloor` y su comprobación en
   `scripts/lib/validate.mjs`.
5. `feat(content): actionable first-mismatch diff on equivalence failure` —
   `scripts/lib/diff.mjs` y su uso en `scripts/verify-content.mjs`.
6. `test(content): cover rollback, tmp ownership, and content-level equivalence` —
   `tests/pipeline.test.mjs` (TEST 3B, TEST OWNERSHIP, equivalence
   negativos) y el test de non-regression floor en `tests/validate.test.mjs`.
7. `chore(content): pin Node tooling requirements` — `engines` en
   `package.json`, `.nvmrc`, `tsconfig.json`, `typescript` como
   devDependency.
8. `docs(content): document transactional promotion and floor` —
   `docs/DATA_INTEGRITY.md`, `docs/adr/0003-node-tooling-portability.md`,
   este mismo archivo.

No mezclar ninguno de estos con cambios de React/Vite/Capacitor — esta
fase sigue siendo solo capa de datos.
