import type { ExerciseCatalog, ExerciseCatalogEntry } from "../domain/exerciseCatalog";

const COEFFICIENTS = new Set([0, 0.25, 0.5, 0.75, 1]);

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

function parseCatalog(value: unknown): ExerciseCatalog {
  if (!isObject(value) || typeof value.version !== "string" || !Array.isArray(value.exercises)) {
    throw new Error("Formato do catálogo inválido.");
  }
  const exercises = value.exercises.map(parseEntry);
  if (exercises.some((entry) => entry === null)) throw new Error("Há um exercício inválido no catálogo.");
  return { version: value.version, exercises: exercises as ExerciseCatalogEntry[] };
}

/** Loads the generated static asset; parsing and matching remain in the pure domain module. */
export async function loadExerciseCatalog(): Promise<ExerciseCatalog> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/prompt/exercise-catalog.json`);
  if (!response.ok) throw new Error(`Não foi possível carregar o catálogo (${response.status}).`);
  return parseCatalog(await response.json());
}
