# ADR-0002: Capa de persistencia del progreso (Dexie/IndexedDB vs Capacitor Preferences vs localStorage)

- **Estado:** Decidido (arquitectura) / migración de datos legacy documentada, no implementada
- **Fecha:** 2026-09-04

## Contexto

La app legacy guarda todo el estado (progreso de estudio, historial de
tests, posición en flashcards) en un único blob bajo `localStorage`, clave
`chuletaC1_v1` (ver `loadState()` / `saveState()` en `legacy/index.original.html`).

El progreso nuevo va a ser estructurado: progreso por tema, intentos de
test, sesiones de test, progreso de flashcards, errores, notas, favoritos y
posiblemente ajustes. `localStorage` es un almacén clave-valor de strings
sin índices ni transacciones — obliga a serializar/deserializar el blob
entero en cada escritura, lo cual no escala bien con datos estructurados y
es propenso a condiciones de carrera si en el futuro hay más de un
escritor (ej. un service worker).

## Decisión

- **Progreso estructurado → Dexie sobre IndexedDB.** Colecciones:
  `topicProgress`, `quizAttempts`, `quizSessions`, `flashcardProgress`,
  `errors`, `notes`, `favorites`, y `settings` si su forma de uso encaja
  mejor como colección indexada que como preferencia simple.
- **Capacitor Preferences → solo para preferencias mínimas** (ej. tema
  claro/oscuro, tamaño de fuente) si hay una razón técnica concreta para
  sacarlas de IndexedDB (por ejemplo, necesitarlas antes de que la app
  React monte). No como almacén por defecto.
- **`localStorage` queda descartado** como arquitectura definitiva del
  progreso nuevo.

## Razón

- Dexie da índices, consultas y transacciones sobre IndexedDB con una API
  razonable, sin la complejidad de rodar IndexedDB a mano.
- Separar por colección (en vez de un blob único) permite consultas
  baratas (ej. "intentos de test del tema I-T01") sin deserializar todo el
  estado de la app.
- Capacitor Preferences está pensado para pares clave-valor pequeños
  (settings), no para colecciones de registros con relaciones — usarlo como
  almacén principal habría sido forzar la herramienta.

## Migración desde `chuletaC1_v1` (documentada, NO implementada en esta fase)

Para no perder progreso de usuarios que ya usaban la app legacy (PWA en el
navegador), el plan cuando se implemente es:

1. Al arrancar, si existe `localStorage['chuletaC1_v1']` y las tablas Dexie
   están vacías (primera ejecución tras la migración), parsear el blob
   legacy.
2. Mapear su forma interna (a determinar exactamente leyendo
   `loadState()`/`saveState()` del legacy con detalle — no se ha hecho
   todavía en esta fase) a las colecciones nuevas: progreso de tema →
   `topicProgress`, historial de test → `quizAttempts`/`quizSessions`,
   posición de flashcards → `flashcardProgress`.
3. Escribir el resultado en Dexie y marcar la migración como hecha (ej. un
   registro en `settings`), para no repetirla en cada arranque.
4. Dejar el `localStorage` original intacto (no borrarlo) durante un
   periodo de gracia, por si hay que hacer rollback.

Esto se implementará en la fase de estado/persistencia, no en la fase de
Data Foundation actual — aquí solo se deja documentado para no perder la
decisión ni el motivo.

## Trade-offs

- Dexie es una dependencia nueva (pequeña, ~25 KB min+gzip) — aceptable
  frente a rodar IndexedDB a mano, dado el número de colecciones.
- IndexedDB en WebView de Capacitor Android tiene buen soporte, pero habrá
  que verificar en dispositivo real (no solo en navegador de escritorio)
  antes de dar la fase de persistencia por cerrada.

## Consecuencias

- `src/db/` (no creado todavía — se crea cuando empiece esa fase) contendrá
  el esquema Dexie y las funciones de acceso, siguiendo el mismo patrón de
  capa de acceso centralizada que `src/data/index.ts`.
- Ningún componente de `src/features/` debe hablar con Dexie directamente,
  igual que no debe importar los JSON de contenido directamente.
