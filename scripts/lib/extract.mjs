// scripts/lib/extract.mjs
//
// Extractor de literales JS embebidos en el HTML legacy de Chuleta C1.
//
// La app original define tres constantes JS a nivel de módulo (FLASHCARDS,
// QUIZBANK, STUDYBANK) cuyo contenido, en la fuente actual, resulta ser JSON
// válido (claves y strings entrecomillados con "). No usamos una regex
// "hasta el primer ]; o };" porque las estructuras son anidadas (arrays de
// objetos con arrays dentro) y una regex no-greedy cortaría en el primer
// cierre interno, no en el cierre real de la constante.
//
// En su lugar hacemos un escaneo de profundidad de corchetes/llaves que
// respeta strings y escapes, para encontrar el cierre real de la
// declaración, y luego JSON.parse() ese fragmento. Si en algún momento el
// contenido dejara de ser JSON válido (comillas simples, comentarios,
// trailing commas...), JSON.parse lanzará y el extractor debe fallar de
// forma ruidosa, nunca "arreglar" el contenido en silencio.

/**
 * Extrae el literal (array u objeto) asignado a `const <constName> = ...;`
 * dentro de un string HTML, mediante bracket-matching consciente de strings.
 * @param {string} html
 * @param {string} constName
 * @returns {string} el literal crudo, sin el `;` final
 */
export function extractLiteralSource(html, constName) {
  const marker = `const ${constName} = `;
  const idx = html.indexOf(marker);
  if (idx === -1) {
    throw new Error(`No se encontró "${marker}" en el HTML de origen.`);
  }
  const start = idx + marker.length;

  let depth = 0;
  let started = false;
  let inString = false;
  let stringChar = '';
  let escape = false;
  let i = start;
  const n = html.length;

  for (; i < n; i++) {
    const c = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === stringChar) {
        inString = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '[' || c === '{') {
      depth++;
      started = true;
      continue;
    }
    if (c === ']' || c === '}') {
      depth--;
      if (started && depth === 0) {
        i++; // incluir el carácter de cierre
        break;
      }
    }
  }

  if (!started || depth !== 0) {
    throw new Error(
      `No se pudo determinar el cierre del literal para "${constName}" (bracket-matching incompleto).`
    );
  }

  return html.slice(start, i);
}

/**
 * Extrae y parsea las tres constantes de contenido desde el HTML legacy.
 * Lanza si alguna no se encuentra o no es JSON válido — no hace fallback
 * silencioso ni "limpieza" del contenido.
 * @param {string} html
 */
export function extractContent(html) {
  const names = ['STUDYBANK', 'QUIZBANK', 'FLASHCARDS'];
  const out = {};
  for (const name of names) {
    const raw = extractLiteralSource(html, name);
    try {
      out[name] = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `"${name}" no es JSON válido tras el bracket-matching: ${err.message}`
      );
    }
  }
  return out;
}
