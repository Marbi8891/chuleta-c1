# Integridad del contenido — Chuleta C1

Este documento describe cómo se protege el contenido académico (25 temas,
25 bancos de test, 500 preguntas, 165 flashcards) durante la migración desde
la app legacy hacia la nueva arquitectura, y cómo evoluciona ese baseline en
el futuro sin perder las garantías.

## 1. Fuente legacy

Todo el contenido nace de un único archivo: `legacy/index.original.html`,
una copia congelada e inmutable de la app original (`chuleta_c1.html`).
Ese archivo no se edita nunca a mano. Si algún día hace falta reemplazarlo
(por ejemplo, porque se añade un tema nuevo en la fuente original), se
sustituye entero y se actualiza deliberadamente `CONTENT_INTEGRITY.json`
(sección 8) — nunca se parchea el HTML in situ.

## 2. SHA gate

`scripts/extract-content.mjs` no lee ni escribe nada de contenido antes de
comprobar que el SHA-256 real de `legacy/index.original.html` coincide con
`CONTENT_INTEGRITY.json → legacySource.sha256`. Si no coincide:

```
ERROR: Legacy source SHA-256 mismatch.
Expected:
  <hash esperado>
Actual:
  <hash real>
Extraction aborted. No files were modified.
```

y el proceso termina con código de salida distinto de cero, sin tocar
`.tmp/` ni `src/data/`. Esto evita que un legacy corrupto, movido por
error, o editado a mano, se cuele en el pipeline sin que nadie se entere.

## 3. Baseline y non-regression floor

`CONTENT_INTEGRITY.json` es la única fuente de verdad para los conteos
esperados y para el SHA esperado del legacy. Ningún script tiene estos
números "hardcodeados" por su cuenta — todos los leen de este archivo.
Hay dos conceptos separados, deliberadamente independientes entre sí:

- **`baseline`** — los conteos de la versión ACTUAL. `validate-content`
  exige `actual === baseline` exactamente. Se actualiza cada vez que el
  contenido cambia de forma legítima (sección 9).
- **`nonRegressionFloor`** — el mínimo histórico protegido. `validate-content`
  exige además `actual >= nonRegressionFloor`, de forma independiente del
  valor de `baseline`.

La razón de tener los dos: si solo existiera `baseline`, sería posible
reducir el legacy a (por ejemplo) 1 tema / 1 pregunta / 1 flashcard,
actualizar `baseline` a esos mismos números, y obtener `OVERALL: PASS` —
porque `actual === baseline` seguiría siendo cierto. `nonRegressionFloor`
no se mueve solo porque `baseline` se mueva: solo sube deliberadamente,
cuando alguien confirma que el contenido nuevo realmente lo alcanza. Así,
una pérdida de contenido (accidental o no) sigue fallando aunque el
propio `baseline` "mienta".

Valor inicial de ambos (coinciden, porque hoy `baseline` == el máximo
histórico conocido):

```json
"baseline":            { "studyTopics": 25, "quizBanks": 25, "questions": 500, "flashcards": 165 },
"nonRegressionFloor":  { "studyTopics": 25, "quizBanks": 25, "questions": 500, "flashcards": 165 }
```

## 4. Flujo de extracción

```
legacy/index.original.html
          │
          ▼
      SHA gate ─────────── mismatch ──▶ abortar, no escribir nada
          │ match
          ▼
        parse ───────────── error ────▶ abortar, no escribir nada
          │ ok
          ▼
   .tmp/content-extraction/         (workspace PROPIO del extractor)
   (study_bank.json, quiz_bank.json, flashcards.json)
          │
          ▼
     validación estructural ── FAIL ──▶ borrar .tmp/content-extraction/,
   (scripts/lib/validate.mjs)              src/data intacto
          │ PASS
          ▼
   promoción TRANSACCIONAL (stage todos → backup todos → commit todos)
          │                    │
          │ commit completo    └── falla a mitad → ROLLBACK completo,
          ▼                        src/data queda exactamente como antes
        src/data/
   (study_bank.json, quiz_bank.json, flashcards.json)
```

`scripts/verify-content.mjs` es la versión de solo lectura de este mismo
flujo: no escribe nada, pero re-ejecuta la extracción en memoria y compara
contra `src/data/` (capa de "equivalencia") además de correr las mismas
reglas estructurales sobre el contenido ya comprometido. Es la puerta que
se ejecuta antes de dar una fase por buena.

## 5. Promoción transaccional con rollback

Un `rename()` individual es atómico a nivel de sistema operativo — en
cualquier instante, un fichero o bien es el contenido anterior completo, o
bien es el nuevo contenido completo. Pero la promoción mueve TRES ficheros
(`study_bank.json`, `quiz_bank.json`, `flashcards.json`), y tres renames
atómicos por separado no forman una operación atómica conjunta: si el
proceso muere entre el segundo y el tercer rename, dos ficheros quedan
"nuevos" y uno "viejo".

`promoteTransactionally()` en `scripts/extract-content.mjs` cierra ese
hueco con una transacción de aplicación, en tres fases:

1. **Stage** — escribe los TRES ficheros nuevos como
   `<archivo>.promoting` (ninguno toca todavía el nombre final).
2. **Backup** — copia CUALQUIER fichero final que ya exista a
   `<archivo>.backup` (si `src/data/` está vacío la primera vez, no hay
   nada que respaldar).
3. **Commit** — hace `rename()` de cada `.promoting` a su nombre final,
   uno a uno. Si cualquier rename falla (o la inyección de fallos de test
   dispara, ver más abajo) a mitad de esta fase:
   - los ficheros ya renombrados en esta transacción se restauran desde su
     `.backup` (o se eliminan, si no existían antes de empezar),
   - cualquier `.promoting` que no llegó a promocionarse se borra,
   - cualquier `.backup` sobrante se borra,
   - el error se relanza, `extract-content.mjs` termina con código != 0.

El resultado: tras cualquier fallo durante la promoción, `src/data/`
(los tres ficheros) es SHA-256-idéntico a como estaba antes de empezar la
transacción — nunca una mezcla de viejo y nuevo. `tests/pipeline.test.mjs`
(TEST 3B) lo demuestra forzando el fallo justo después de promocionar el
primer fichero.

**Inyección de fallos, solo para tests:** la variable de entorno
`CHULETA_TEST_FAIL_PROMOTION_AFTER=N` fuerza un fallo sintético justo
después de promocionar N ficheros con éxito. Es inerte en ejecución
normal — ningún script de `package.json` la define, así que
`npm run extract-content` nunca la activa por accidente.

## 6. `.tmp/` es compartido; `.tmp/content-extraction/` es del extractor

`cleanTmp()` borra únicamente `.tmp/content-extraction/` — el workspace
propio del extractor — nunca `.tmp/` entero. `.tmp/` en la raíz del
proyecto puede, en principio, contener temporales de otras herramientas;
borrarlo entero sería sobrepasar lo que a este script le corresponde.
`tests/pipeline.test.mjs` (TEST OWNERSHIP) lo comprueba dejando un fichero
ajeno en `.tmp/otro-proceso/` y confirmando que sigue ahí después de una
extracción completa.

## 7. Comprobaciones de equivalencia y diff accionable

"500 preguntas" no es suficiente por sí solo: podría haber 500 preguntas y
que una de ellas tuviera una respuesta alterada — incluso alterada a OTRA
clave válida (`b` → `c`), lo cual ninguna regla estructural detecta por sí
sola, porque `c` es una respuesta válida en forma. Por eso
`verify-content.mjs` compara, campo a campo, una re-extracción fresca del
legacy contra `src/data/*.json` (comparación profunda, no solo de
longitud).

Cuando la equivalencia falla, `scripts/lib/diff.mjs` busca el PRIMER
registro que difiere (primero en preguntas, luego en temas de estudio,
luego en flashcards — no un motor de diff genérico, solo lo que hace falta
para este modelo de datos concreto) y `verify-content.mjs` lo imprime de
forma accionable:

```
CONTENT EQUIVALENCE FAIL
Record:
I-T01-Q003
Field:
answer
Legacy:
b
Extracted:
c
```

`tests/legacy-equivalence.test.mjs` cubre lo mismo pero como aserciones
individuales por tema/pregunta/flashcard; `tests/pipeline.test.mjs` cubre
el camino de caja negra completo (extraer con éxito, alterar `src/data/`
a mano, verificar que `verify-content` lo detecta) para un `stem` alterado
y para un `answer` cambiado entre dos claves igualmente válidas.

## 8. QuestionId global

Cada pregunta tiene, además de su `num` dentro de su banco, un identificador
global estable: `<topicId>-Q<NNN>` (ej. `I-T01-Q001`), construido por
`buildQuestionId()`. La implementación única vive en
`src/data/ids.impl.mjs` (JavaScript plano, sin dependencia de tooling
TypeScript — ver `docs/adr/0003-node-tooling-portability.md`);
`src/data/ids.ts` es un envoltorio con tipos para el futuro consumo desde
React. No es un dato nuevo del contenido académico — es una vista
calculada en memoria a partir de `topicId` + `num`, pensada para que
progreso, errores, favoritos, historial, repetición espaciada y
simulacros tengan una clave estable que no dependa de índices de array.
`verify-content.mjs` genera el ID de las 500 preguntas y comprueba que no
hay colisiones.

## 9. Procedimiento de actualización del baseline

Cuando se añada contenido nuevo de forma legítima (ej. un tema del Bloque V):

1. Generar el nuevo `legacy/index.original.html` con el contenido
   actualizado (fuera de este repo, con el proceso que corresponda).
2. Calcular su SHA-256 y actualizar `CONTENT_INTEGRITY.json` →
   `legacySource.sha256` y `baseline` con los nuevos conteos esperados.
   Este es un cambio deliberado y visible en el control de versiones — el
   verificador nunca actualiza el baseline por sí solo.
3. Ejecutar `npm run extract-content` (fallará si el SHA no coincide con lo
   que se acaba de registrar — confirma que el paso 2 se hizo bien).
4. Ejecutar `npm run check` y confirmar `OVERALL: PASS`.
5. Solo si el paso 4 pasa con los conteos nuevos: subir también
   `nonRegressionFloor` a esos mismos valores. Este es un paso deliberado
   y separado — no ocurre automáticamente por actualizar `baseline`. El
   floor nunca debe bajar; solo tiene sentido subirlo tras confirmar que
   el contenido nuevo lo alcanza de verdad.

Una reducción inesperada de `baseline` (por ejemplo, alguien lo edita a la
baja por error, o una fuente legacy incompleta) sigue fallando contra
`nonRegressionFloor` aunque `baseline` y el contenido real "coincidan" entre
sí — ver sección 3.

## 10. Comportamiento ante fallos

En cualquier fallo (SHA gate, parseo, validación estructural, promoción,
equivalencia) el proceso:

- imprime el problema concreto (qué ID, qué campo, qué valor esperado vs
  real — nunca solo "validation failed"; en el caso de equivalencia,
  además, el primer registro que difiere — ver sección 7),
- termina con código de salida distinto de cero,
- no deja ningún archivo de `src/data/` a medias (rollback completo si el
  fallo ocurre durante la promoción — sección 5), y
- no deja residuos: ni `.tmp/content-extraction/` (sección 6), ni ficheros
  `*.promoting` / `*.backup` sueltos en `src/data/`.

Esto está cubierto por tests de caja negra en `tests/pipeline.test.mjs`
(SHA gate, protección de escritura parcial, rollback transaccional,
ownership de `.tmp/`, equivalencia negativa) y tests unitarios en
`tests/validate.test.mjs` (cada regla estructural, una por una, más el
non-regression floor).

## 11. Política de preservación del contenido académico

El contenido (Markdown de estudio, enunciados, opciones, respuestas,
flashcards) está auditado por preparadores expertos
(`CONTENT_INTEGRITY.json → academicStatus: "EXPERT_AUDITED"`) y esta capa
de datos existe para **migrarlo, no para editarlo**. Ningún script de esta
fase reescribe, corrige o "limpia" contenido académico — solo lo extrae,
lo valida estructuralmente (formato, no corrección) y detecta si ha
cambiado respecto al origen. Cualquier corrección de contenido (una
pregunta mal formulada, una fecha desactualizada en la legislación...) es
una decisión editorial que se toma sobre `legacy/index.original.html`
fuera de este pipeline, nunca parcheando `src/data/*.json` directamente.
