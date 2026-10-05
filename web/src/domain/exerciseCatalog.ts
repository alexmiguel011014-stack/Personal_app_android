import type { Exercise } from "./exercise";

export interface ExerciseCatalogEntry {
  name: string;
  group: string;
  muscles: Record<string, number>;
}

export interface ExerciseCatalog {
  version: string;
  exercises: ExerciseCatalogEntry[];
}

const EQUIPMENT_QUALIFIERS = /(?:^|\s)(?:com\s+barra|com\s+halteres|na\s+maquina)(?=\s|$)/g;
const INSIGNIFICANT_TOKENS = new Set(["a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "com", "na", "nas", "no", "nos"]);

/** Accent-insensitive, case-insensitive name normalization. Equipment qualifiers are kept here. */
export function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function withoutEquipmentQualifiers(normalized: string): string {
  return normalized.replace(EQUIPMENT_QUALIFIERS, " ").trim().replace(/\s+/g, " ");
}

function uniqueMatch(
  catalog: ExerciseCatalog,
  predicate: (entry: ExerciseCatalogEntry) => boolean,
  how: "normalized" | "close",
): { entry: ExerciseCatalogEntry; how: "normalized" | "close" } | null {
  const matches = catalog.exercises.filter(predicate);
  return matches.length === 1 ? { entry: matches[0], how } : null;
}

/**
 * Resolve a pasted/AI exercise name conservatively. Exact and normalized equality win; equipment
 * qualifiers are dropped only on a second pass. A partial token match is returned only if unique.
 */
export function lookupExercise(
  catalog: ExerciseCatalog,
  name: string,
): { entry: ExerciseCatalogEntry; how: "exact" | "normalized" | "close" } | null {
  const exactMatches = catalog.exercises.filter((entry) => entry.name === name);
  if (exactMatches.length === 1) return { entry: exactMatches[0], how: "exact" };
  if (exactMatches.length > 1) return null;

  const normalizedName = normalizeName(name);
  if (!normalizedName) return null;
  const normalized = uniqueMatch(
    catalog,
    (entry) => normalizeName(entry.name) === normalizedName,
    "normalized",
  );
  if (normalized) return normalized;
  if (catalog.exercises.filter((entry) => normalizeName(entry.name) === normalizedName).length > 1) return null;

  const normalizedWithoutQualifier = withoutEquipmentQualifiers(normalizedName);
  if (normalizedWithoutQualifier !== normalizedName && normalizedWithoutQualifier !== "") {
    const qualified = uniqueMatch(
      catalog,
      (entry) => withoutEquipmentQualifiers(normalizeName(entry.name)) === normalizedWithoutQualifier,
      "normalized",
    );
    if (qualified) return qualified;
    if (
      catalog.exercises.filter(
        (entry) => withoutEquipmentQualifiers(normalizeName(entry.name)) === normalizedWithoutQualifier,
      ).length > 1
    ) {
      return null;
    }
  }

  const tokens = normalizedWithoutQualifier.split(" ").filter((token) => !INSIGNIFICANT_TOKENS.has(token));
  if (tokens.length === 0) return null;
  const close = uniqueMatch(
    catalog,
    (entry) => {
      const candidate = withoutEquipmentQualifiers(normalizeName(entry.name))
        .split(" ")
        .filter((token) => !INSIGNIFICANT_TOKENS.has(token));
      const shorter = tokens.length <= candidate.length ? tokens : candidate;
      const longer = tokens.length <= candidate.length ? candidate : tokens;
      const longerTokens = new Set(longer);
      return shorter.every((token) => longerTokens.has(token));
    },
    "close",
  );
  if (close) return close;
  return null;
}

/** Only non-zero muscles contribute volume and need to travel with a stored exercise. */
export function catalogActivation(entry: ExerciseCatalogEntry): Record<string, number> {
  return Object.fromEntries(Object.entries(entry.muscles).filter(([, coefficient]) => coefficient !== 0));
}

/** Only exact/normalized matches are authoritative; close matches stay suggestions until selected. */
export function applyCatalogActivation(exercise: Exercise, catalog: ExerciseCatalog): Exercise {
  const match = lookupExercise(catalog, exercise.name);
  return match && match.how !== "close" ? { ...exercise, muscleActivation: catalogActivation(match.entry) } : exercise;
}

export function applyCatalogActivations(exercises: readonly Exercise[], catalog: ExerciseCatalog): Exercise[] {
  return exercises.map((exercise) => applyCatalogActivation(exercise, catalog));
}
