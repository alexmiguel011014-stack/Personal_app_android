import { decodePerformedSets, type PerformedSet } from "./exercise";
import { toDoubleOrNull } from "./kotlin";
import type { WorkoutLogDoc } from "./metrics";

// GOALS.md §23g: the phone's "Progressão de Carga" (ExerciseProgressionChart) and "Atividade
// Recente" (StudentDetailsScreen) as data for tables — phase 1 has no charts.

/** The exercise picker: every exercise with a log, once each, in pt-BR order like the student list. */
export function loggedExercises(logs: readonly WorkoutLogDoc[]): string[] {
  return [...new Set(logs.map((log) => log.exerciseName))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export interface ProgressionPoint {
  /** Epoch ms. */
  date: number;
  maxWeight: number;
}

/**
 * One point per log of `exercise`: its heaviest set, oldest first, as the chart runs. A set's weight
 * is free text the student typed, and only what the phone's toFloatOrNull reads counts — "22.5" does,
 * "22,5" and "20kg" don't — so this table and the phone's chart show the same points. A log with no
 * readable weight is left out, as on the phone.
 */
export function loadProgression(logs: readonly WorkoutLogDoc[], exercise: string): ProgressionPoint[] {
  const points: ProgressionPoint[] = [];
  for (const log of logs) {
    if (log.exerciseName !== exercise) continue;
    const weights = decodePerformedSets(log.performedSetsJson)
      .map((set) => toDoubleOrNull(set.weight))
      .filter((weight) => weight !== null);
    if (weights.length > 0) points.push({ date: log.date, maxWeight: Math.max(...weights) });
  }
  return points.sort((a, b) => a.date - b.date);
}

/** "Atividade Recente": the latest `count` logs, newest first. */
export function recentLogs(logs: readonly WorkoutLogDoc[], count = 10): WorkoutLogDoc[] {
  return [...logs].sort((a, b) => b.date - a.date).slice(0, count);
}

/** A log's sets the way the phone lists them: "20x12 · 22,5x10". */
export function formatSets(sets: readonly PerformedSet[]): string {
  return sets.map((set) => `${set.weight}x${set.reps}`).join(" · ");
}
