import { addDays, localDate } from "./dates";
import {
  decodePerformedSets,
  type Exercise,
  type PerformedSet,
} from "./exercise";
import { isKotlinBlank, kotlinTrim } from "./kotlin";
import type { WorkoutLogDoc } from "./metrics";
import { MAX_EXTRA_ROWS, plannedRowCount, type SetRow } from "./sessionLog";

// GOALS.md §38e (U5): what the aluno did the last time they did this exercise — shown above the rows, as each row's
// placeholder, and as "Repetir a última". It reads only the logs already in memory (the aluno's windowed logs, §38b):
// no extra read.

/** An exercise not done for longer than this has no "last time" to show. */
export const LAST_PERFORMANCE_MAX_DAYS = 120;

export interface LastPerformance {
  /** The local day (YYYY-MM-DD) of that session. */
  day: string;
  sets: PerformedSet[];
}

/**
 * The most recent session before `beforeDay` that logged `exerciseName` with at least one set, no more than
 * LAST_PERFORMANCE_MAX_DAYS before it. Two sessions on one day: the later one wins.
 */
export function lastPerformance(
  logs: readonly WorkoutLogDoc[],
  exerciseName: string,
  beforeDay: string,
  timeZone: string,
): LastPerformance | null {
  const earliest = addDays(beforeDay, -LAST_PERFORMANCE_MAX_DAYS);
  let best: { day: string; date: number; sets: PerformedSet[] } | null = null;
  for (const log of logs) {
    if (log.exerciseName !== exerciseName) continue;
    const day = localDate(log.date, timeZone);
    if (day >= beforeDay || day < earliest) continue;
    if (
      best !== null &&
      (day < best.day || (day === best.day && log.date <= best.date))
    )
      continue;
    const sets = decodePerformedSets(log.performedSetsJson);
    if (sets.length === 0) continue;
    best = { day, date: log.date, sets };
  }
  return best === null ? null : { day: best.day, sets: best.sets };
}

/** A stored weight as the aluno reads it: "33.5" → "33,5"; anything else ("20kg", "livre") untouched. */
export function displayWeight(weight: string): string {
  return /^\d+\.\d+$/.test(weight) ? weight.replace(".", ",") : weight;
}

/** "31×12 · 33,5×10". */
export function formatLastSets(sets: readonly PerformedSet[]): string {
  return sets
    .map((set) => `${displayWeight(set.weight)}×${set.reps}`)
    .join(" · ");
}

/**
 * What a row shows while empty: the same set number's weight and reps from last time, else the prescribed carga
 * (weight only). A hint, never a value: nothing reaches the log unless the aluno types it or taps "Repetir a última".
 */
export function rowPlaceholder(
  last: LastPerformance | null,
  exercise: Exercise,
  rowIndex: number,
): SetRow {
  const set = last?.sets.find(
    (candidate) => candidate.setNumber === rowIndex + 1,
  );
  if (set) return { weight: displayWeight(set.weight), reps: String(set.reps) };
  const prescribed =
    exercise.weight !== null && !isKotlinBlank(exercise.weight)
      ? kotlinTrim(exercise.weight)
      : "";
  return { weight: prescribed, reps: "" };
}

/**
 * "Repetir a última": the last session's sets back into the rows, each in the row of its own set number. Rows past the
 * prescribed ones are only created when the trainer allowed extra sets; without the permission those sets are left out,
 * exactly as a typed row past the plan could not exist. Rows the last session did not fill stay as they are.
 */
export function repeatRows(
  current: readonly SetRow[],
  last: LastPerformance,
  targetSets: number,
  canAddSets: boolean,
): SetRow[] {
  const planned = plannedRowCount(targetSets);
  const highest = last.sets.reduce(
    (max, set) => Math.max(max, set.setNumber),
    0,
  );
  const wanted = canAddSets
    ? Math.min(Math.max(highest, planned), planned + MAX_EXTRA_ROWS)
    : planned;
  const rows: SetRow[] = Array.from(
    { length: Math.max(current.length, wanted) },
    (_, index) => current[index] ?? { weight: "", reps: "" },
  );
  for (const set of last.sets) {
    if (set.setNumber >= 1 && set.setNumber <= wanted)
      rows[set.setNumber - 1] = { weight: set.weight, reps: String(set.reps) };
  }
  return rows;
}
