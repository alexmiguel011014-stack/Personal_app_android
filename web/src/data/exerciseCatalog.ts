import { doc, getDoc, type Firestore } from "firebase/firestore";
import type { ExerciseCatalog, ExerciseCatalogEntry } from "../domain/exerciseCatalog";

// GOALS.md §33 — the trainer's exercise reference reaches the editor through ONE Firestore document,
// `appData/exerciseCatalog`, that firestore.rules (v6) lets only an approved, active trainer and the ADM
// read. It used to be a public JSON file; a file under public/ is downloadable by anyone, so it is gone
// (scripts/copy-prompt-assets.mjs even deletes a stale copy). Handling rules here, on purpose:
//   - the catalog lives in module memory only: never localStorage/IndexedDB, and the Firestore client is on
//     its default memory cache (data/firebase.ts configures no persistence);
//   - it is dropped when the person signs out or changes (SessionProvider calls clearExerciseCatalogCache),
//     so a shared computer keeps nothing;
//   - nothing here logs it, and a failure's message never contains any of it.

const COEFFICIENTS = new Set([0, 0.25, 0.5, 0.75, 1]);

/** The path of the one document — also what scripts/publish-exercise-catalog.mjs writes. */
export const CATALOG_COLLECTION = "appData";
export const CATALOG_DOC_ID = "exerciseCatalog";

/** The rules refused the read: a student, a suspended or billing-locked trainer, or no profile. */
export class CatalogAccessError extends Error {
  constructor() {
    super("Sem acesso aos dados dos exercícios.");
    this.name = "CatalogAccessError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntry(value: unknown): ExerciseCatalogEntry | null {
  if (!isObject(value) || typeof value.name !== "string" || value.name.trim() === "" || typeof value.group !== "string") {
    return null;
  }
  if (!isObject(value.muscles)) return null;
  const muscles: Record<string, number> = {};
  for (const [name, coefficient] of Object.entries(value.muscles)) {
    if (typeof coefficient !== "number" || !COEFFICIENTS.has(coefficient)) return null;
    muscles[name] = coefficient;
  }
  return Object.keys(muscles).length > 0 ? { name: value.name, group: value.group, muscles } : null;
}

export function parseCatalog(value: unknown): ExerciseCatalog {
  if (!isObject(value) || typeof value.version !== "string" || !Array.isArray(value.exercises)) {
    throw new Error("Formato dos dados dos exercícios inválido.");
  }
  const exercises = value.exercises.map(parseEntry);
  if (exercises.some((entry) => entry === null)) throw new Error("Há um exercício inválido nos dados.");
  return { version: value.version, exercises: exercises as ExerciseCatalogEntry[] };
}

let cache: { uid: string; catalog: ExerciseCatalog } | null = null;

/** Forget the catalog — on sign-out, and whenever the signed-in person changes. */
export function clearExerciseCatalogCache(): void {
  cache = null;
}

/**
 * Reads the catalog document as `uid` (the cache is per person). A refused read becomes
 * CatalogAccessError; any other failure (offline, a malformed document) is an ordinary Error.
 */
export async function loadExerciseCatalog(db: Firestore, uid: string): Promise<ExerciseCatalog> {
  if (cache !== null && cache.uid === uid) return cache.catalog;
  let data: unknown;
  try {
    data = (await getDoc(doc(db, CATALOG_COLLECTION, CATALOG_DOC_ID))).data();
  } catch (caught) {
    if (isObject(caught) && caught.code === "permission-denied") throw new CatalogAccessError();
    throw new Error("Não foi possível carregar os dados dos exercícios.");
  }
  if (data === undefined) throw new Error("Os dados dos exercícios ainda não foram publicados.");
  const catalog = parseCatalog(data);
  cache = { uid, catalog };
  return catalog;
}
