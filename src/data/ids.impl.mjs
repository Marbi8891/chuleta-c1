// src/data/ids.impl.mjs
//
// Implementación ÚNICA y canónica de la identidad global de pregunta.
// Deliberadamente en JavaScript plano (no .ts): así puede importarla
// cualquier script de Node (scripts/lib/validate.mjs, tests) sin depender
// de que la versión de Node en uso tenga type-stripping nativo de
// TypeScript activado — eso varía entre versiones/entornos de CI y no es
// algo de lo que este pipeline deba depender implícitamente (ver
// docs/adr/0003-node-tooling-portability.md).
//
// src/data/ids.ts es un envoltorio fino sobre este mismo archivo que añade
// tipos para el futuro consumo desde React/Vite (que compila TS con su
// propio toolchain, independiente de Node). No hay una segunda
// implementación: ids.ts re-exporta esta.
//
// Tipado para editores: ver ids.impl.d.mts (declaración hermana).

/**
 * Construye el identificador global de una pregunta: `<topicId>-Q<NNN>`
 * (número con al menos 3 dígitos, ej. "I-T01-Q001", "I-T01-Q020").
 *
 * Valida sus argumentos activamente — un id mal formado que se cuele en
 * silencio es peor que un fallo ruidoso, porque se usará como clave de
 * progreso/historial más adelante.
 *
 * @param {string} topicId
 * @param {number} questionNumber
 * @returns {string}
 */
export function buildQuestionId(topicId, questionNumber) {
  if (typeof topicId !== 'string' || topicId.trim().length === 0) {
    throw new Error(`buildQuestionId: topicId inválido: ${JSON.stringify(topicId)}`);
  }
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    throw new Error(
      `buildQuestionId: questionNumber debe ser un entero >= 1, recibido ${JSON.stringify(questionNumber)} (topic ${topicId})`
    );
  }
  const padded = String(questionNumber).padStart(3, '0');
  return `${topicId}-Q${padded}`;
}

const QUESTION_ID_RE = /^Q(\d{3,})$/;

// No se añade parseQuestionId() todavía: nada en el proyecto necesita
// deshacer un QuestionId en sus partes (la resolución se hace con un mapa
// construido a partir de los datos reales, ver getQuestionById() en
// src/data/index.ts). Añadirla ahora sería sobreingeniería especulativa.
// Sí se deja el patrón (QUESTION_ID_RE) documentado por si hace falta
// validar el formato de un id recibido de fuera (ej. deep link) sin tener
// que reconstruir todo el índice.

/**
 * @param {string} value
 * @returns {boolean}
 */
export function isWellFormedQuestionId(value) {
  const dashIdx = value.lastIndexOf('-');
  if (dashIdx <= 0) return false;
  const suffix = value.slice(dashIdx + 1);
  return QUESTION_ID_RE.test(suffix);
}
