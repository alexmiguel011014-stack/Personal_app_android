import type { PerformedSet } from "./exercise";
import { isKotlinBlank, kotlinTrim, toIntOrNull } from "./kotlin";

// GOALS.md §23h: logging a session — StudentLogSessionScreen's rules. The student fills rows of
// (weight, reps) per exercise; on save, each exercise with at least one complete row becomes one
// workoutLogs document, as the phone writes them.

export interface SetRow {
  weight: string;
  reps: string;
}

/**
 * The weight as it will be stored: free text, as on the phone ("20", "20kg", "livre"), trimmed. One
 * web-only normalisation: a plain comma decimal — "22,5", which a Brazilian phone keyboard produces
 * — becomes "22.5". The phone's progression chart can't read a comma (GOALS.md §23g, part 4), so
 * this makes what the web writes readable there, without touching anything else anyone typed.
 */
export function normalizeWeight(text: string): string {
  const trimmed = kotlinTrim(text);
  return /^\d+,\d+$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed;
}

/** Whether a row counts: a weight, and reps as a whole number above zero. */
export function isCompleteRow(row: SetRow): boolean {
  const reps = toIntOrNull(kotlinTrim(row.reps));
  return !isKotlinBlank(row.weight) && reps !== null && reps > 0;
}

/**
 * The complete rows as sets. `setNumber` is the row's position, as on the phone — a skipped row
 * leaves a gap rather than renumbering what the student did. One tightening: the phone accepts 0 or
 * negative reps; a set of zero reps isn't a set.
 */
export function performedSets(rows: readonly SetRow[]): PerformedSet[] {
  const sets: PerformedSet[] = [];
  rows.forEach((row, index) => {
    if (!isCompleteRow(row)) return;
    sets.push({
      setNumber: index + 1,
      weight: normalizeWeight(row.weight),
      reps: toIntOrNull(kotlinTrim(row.reps)) as number,
    });
  });
  return sets;
}

/** Exercise name → sets, for the exercises with at least one complete row, in the ficha's order. */
export function sessionEntries(rowsByExercise: ReadonlyMap<string, readonly SetRow[]>): [string, PerformedSet[]][] {
  const entries: [string, PerformedSet[]][] = [];
  for (const [exerciseName, rows] of rowsByExercise) {
    const sets = performedSets(rows);
    if (sets.length > 0) entries.push([exerciseName, sets]);
  }
  return entries;
}

/**
 * The rows a form starts with: the ficha's target set count (at least one, at most ten). The phone
 * starts every exercise with a single row and an "Adicionar série" button; starting at the target
 * saves taps on a phone and stores the same thing — empty rows are skipped.
 *
 * On the web a student cannot add sets unless the trainer allowed it (users.canAddSets), so every
 * prescribed set must have its row: the cap is a sanity limit (30), not the old ten.
 */
export const MAX_PLANNED_ROWS = 30;
/** The most extra rows a student can add to one exercise, when allowed. */
export const MAX_EXTRA_ROWS = 10;

/** How many rows are the trainer's own — the prescribed sets — for an exercise. */
export function plannedRowCount(targetSets: number): number {
  return Math.min(Math.max(targetSets, 1), MAX_PLANNED_ROWS);
}

export function initialRows(targetSets: number): SetRow[] {
  return Array.from({ length: plannedRowCount(targetSets) }, () => ({ weight: "", reps: "" }));
}

/**
 * Rows past the prescribed ones are the student's own additions. Only those can be removed and
 * only those can be added past a limit; the prescribed rows are never removable.
 */
export function isExtraRow(index: number, targetSets: number): boolean {
  return index >= plannedRowCount(targetSets);
}

/** Whether another extra row may be added: only when allowed, and under the sanity limit. */
export function canAddExtraRow(allowed: boolean, rowCount: number, targetSets: number): boolean {
  return allowed && rowCount - plannedRowCount(targetSets) < MAX_EXTRA_ROWS;
}
