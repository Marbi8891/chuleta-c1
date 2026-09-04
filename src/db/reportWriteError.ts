// src/db/reportWriteError.ts
//
// Fase 3B, punto 5 (FIRE-AND-FORGET PROGRESS WRITES). Auditoría de
// markTopicStudied()/setFlashcardKnown(): ambas se disparan sin `await`
// desde la UI (marcar un tema como leído o una flashcard como dominada no
// debe bloquear la navegación — no hay valor real en hacer esperar al
// usuario a que Dexie confirme una escritura de bajo riesgo y fácilmente
// reversible con un nuevo toque). Eso es una decisión válida, pero
// "no esperar" no es lo mismo que "ignorar el resultado": antes de esta
// fase esas llamadas eran `void fn(...)` sin ningún `.catch`, así que un
// fallo real de Dexie (cuota agotada, base cerrada, etc.) se convertía en
// una promesa rechazada sin gestionar (unhandled rejection) — visible como
// mucho en la consola del navegador con un stack genérico, sin contexto de
// qué escritura falló ni qué dato se perdió.
//
// Este helper centraliza el mínimo exigido por la especificación de Fase
// 3B: capturar el error, dejar un log claro (con contexto de qué escritura
// era) y evitar la promesa rechazada sin manejar — nada más complejo
// (no hay cola de reintentos ni sincronización en segundo plano).
export function reportWriteError(context: string, error: unknown): void {
  console.error(`[db] escritura de progreso fallida (${context}); el cambio no se ha guardado.`, error);
}
