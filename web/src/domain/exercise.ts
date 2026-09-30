// GOALS.md §23e: mirrors shared/.../data/model/Exercise.kt and PerformedSet.kt. Both travel through
// Firestore as JSON strings — workouts.exercisesJson and workoutLogs.performedSetsJson — written and
// read by the phone with kotlinx.serialization, so the web has to produce JSON kotlinx accepts and
// read what it writes.

/** One prescribed exercise in a ficha. */
export interface Exercise {
  name: string;
  sets: number;
  /** A string so it can hold "10-12" or "Exaustão". */
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  /** Muscle → activation coefficient (0.0–1.0), from a Smart Paste annotation. */
  muscleActivation: Record<string, number> | null;
}

/** One set a student actually performed. */
export interface PerformedSet {
  setNumber: number;
  weight: string;
  reps: number;
}

/**
 * kotlinx.serialization's default Json leaves out properties equal to their default — every
 * nullable field here defaults to null — so nulls are omitted, in declaration order. (Not
 * byte-identical: kotlinx writes 1.0 where JSON.stringify writes 1, and both decode the same.)
 */
export function encodeExercises(exercises: readonly Exercise[]): string {
  return JSON.stringify(
    exercises.map((exercise) => {
      const out: Record<string, unknown> = { name: exercise.name, sets: exercise.sets, reps: exercise.reps };
      if (exercise.weight !== null) out.weight = exercise.weight;
      if (exercise.restSeconds !== null) out.restSeconds = exercise.restSeconds;
      if (exercise.notes !== null) out.notes = exercise.notes;
      if (exercise.muscleActivation !== null) out.muscleActivation = exercise.muscleActivation;
      return out;
    }),
  );
}

export function encodePerformedSets(sets: readonly PerformedSet[]): string {
  return JSON.stringify(sets.map(({ setNumber, weight, reps }) => ({ setNumber, weight, reps })));
}

/**
 * Like the Kotlin mappers: missing JSON reads as an empty list, and so does malformed JSON — one
 * bad element fails the whole list, as kotlinx's decodeFromString does, rather than keeping a
 * partial ficha the phone would show differently.
 */
export function decodeExercises(json: string | null | undefined): Exercise[] {
  return decodeList(json, toExercise);
}

export function decodePerformedSets(json: string | null | undefined): PerformedSet[] {
  return decodeList(json, toPerformedSet);
}

function decodeList<T>(json: string | null | undefined, convert: (item: unknown) => T | null): T[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: T[] = [];
  for (const raw of parsed) {
    const item = convert(raw);
    if (item === null) return [];
    items.push(item);
  }
  return items;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt32(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= -2_147_483_648 && (value as number) <= 2_147_483_647;
}

function optional<T>(value: unknown, check: (v: unknown) => v is T): T | null | undefined {
  if (value === undefined || value === null) return null;
  return check(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isMuscleMap(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every((v) => typeof v === "number" && Number.isFinite(v));
}

function toExercise(raw: unknown): Exercise | null {
  if (!isObject(raw)) return null;
  const { name, sets, reps } = raw;
  if (!isString(name) || !isInt32(sets) || !isString(reps)) return null;
  const weight = optional(raw.weight, isString);
  const restSeconds = optional(raw.restSeconds, isInt32);
  const notes = optional(raw.notes, isString);
  const muscleActivation = optional(raw.muscleActivation, isMuscleMap);
  if (weight === undefined || restSeconds === undefined || notes === undefined || muscleActivation === undefined) {
    return null;
  }
  return { name, sets, reps, weight, restSeconds, notes, muscleActivation };
}

function toPerformedSet(raw: unknown): PerformedSet | null {
  if (!isObject(raw)) return null;
  const { setNumber, weight, reps } = raw;
  if (!isInt32(setNumber) || !isString(weight) || !isInt32(reps)) return null;
  return { setNumber, weight, reps };
}
