// src/state/appState.ts
//
// Estado persistente de progreso del usuario. Migración funcional de las
// funciones loadState()/saveState() y del objeto `state` de
// legacy/index.original.html (líneas 406-429): misma clave de localStorage
// (`chuletaC1_v1`), misma forma de los datos (`known`, `studied`,
// `quizHistory`, `studyFsIndex`), mismo criterio de tolerancia a fallos
// (try/catch silencioso: si localStorage no está disponible, o el JSON
// guardado no es válido, la app sigue funcionando en memoria).
//
// Fase 2 NO migra este contenido a IndexedDB/Dexie (eso es Fase 3 —
// Persistencia). Este módulo debe seguir leyendo y escribiendo exactamente
// la misma clave y forma que la app legacy, para que un usuario que venía
// usando la PWA original no pierda su progreso (temas leídos, flashcards
// dominadas, historial de tests) al abrir la nueva app React en el mismo
// origen/dispositivo.
//
// Patrón: un pequeño store externo con `subscribe`/`getState`, consumido vía
// `useSyncExternalStore` (ver useAppState() más abajo) — evita tener que
// envolver toda la app en un Context solo para estos cuatro campos, que
// además son leídos por features que no comparten ningún otro estado entre
// sí (Study lee/escribe `studied`; Flashcards lee/escribe `known`; el motor
// de test escribe `quizHistory`).

const STORAGE_KEY = 'chuletaC1_v1';

export interface QuizHistoryEntry {
  date: string;
  total: number;
  pct: number;
}

export interface AppState {
  known: Record<string, boolean>;
  studied: Record<string, boolean>;
  quizHistory: QuizHistoryEntry[];
  studyFsIndex?: number;
}

function isAppStateShape(value: unknown): value is Partial<AppState> {
  return typeof value === 'object' && value !== null;
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isAppStateShape(parsed)) {
        return {
          known: parsed.known ?? {},
          studied: parsed.studied ?? {},
          quizHistory: parsed.quizHistory ?? [],
          studyFsIndex: parsed.studyFsIndex,
        };
      }
    }
  } catch {
    // localStorage no disponible o JSON corrupto: seguimos en memoria, igual que legacy.
  }
  return { known: {}, studied: {}, quizHistory: [] };
}

let state: AppState = loadState();
const listeners = new Set<() => void>();

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Igual que legacy: fallo de escritura silencioso (modo privado, cuota, etc.).
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Equivalente a `state.studied[id] = true; saveState();` en paintStudyArticle(). */
export function markStudied(topicId: string): void {
  if (state.studied[topicId]) return;
  state = { ...state, studied: { ...state.studied, [topicId]: true } };
  persist();
  emit();
}

/** Equivalente a `state.known[card.id] = true/false; saveState();` en paintFlash(). */
export function setKnown(cardId: string, known: boolean): void {
  state = { ...state, known: { ...state.known, [cardId]: known } };
  persist();
  emit();
}

/** Equivalente al bucle `delete state.known[c.id]` de flashResetKnown. */
export function resetKnownFor(cardIds: readonly string[]): void {
  const known = { ...state.known };
  for (const id of cardIds) delete known[id];
  state = { ...state, known };
  persist();
  emit();
}

/** Equivalente a saveState_quizHistory(): añade al principio, recorta a 20. */
export function pushQuizHistory(total: number, pct: number): void {
  const entry: QuizHistoryEntry = { date: new Date().toISOString(), total, pct };
  state = { ...state, quizHistory: [entry, ...state.quizHistory].slice(0, 20) };
  persist();
  emit();
}

const STUDY_FS_STEPS = [16, 18, 20, 22, 24] as const;
const STUDY_FS_DEFAULT_INDEX = 1; // 18px, igual que STUDY_FS_DEFAULT en legacy

export function getStudyFsSteps(): readonly number[] {
  return STUDY_FS_STEPS;
}

export function getStudyFsIndex(): number {
  const i = Number.isInteger(state.studyFsIndex) ? (state.studyFsIndex as number) : STUDY_FS_DEFAULT_INDEX;
  return Math.min(Math.max(i, 0), STUDY_FS_STEPS.length - 1);
}

export function setStudyFsIndex(index: number): void {
  const clamped = Math.min(Math.max(index, 0), STUDY_FS_STEPS.length - 1);
  state = { ...state, studyFsIndex: clamped };
  persist();
  emit();
}
