import type { PerformedSet } from "./exercise";
import { decodePerformedSets } from "./exercise";
import type { WorkoutLogDoc } from "./metrics";

// GOALS.md §38e: what the aluno sees right after saving a session — how much they did and the "Recordes": an exercise
// whose heaviest set is above the heaviest they logged before, within the logs in memory (the aluno's window, §38b).

/** The number in a weight the aluno typed: "40", "42,5", "20kg". Free text such as "livre" has none. */
export function numericWeight(text: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*$/i.exec(text);
  return match ? Number(match[1].replace(",", ".")) : null;
}

export interface SessionRecord {
  exercise: string;
  /** The session's heaviest set (ties: the one with more reps). */
  weight: number;
  reps: number;
  /** The heaviest numeric weight logged before. */
  previousBest: number;
}

export interface SessionSummary {
  exercises: number;
  sets: number;
  records: SessionRecord[];
}

function heaviest(
  sets: readonly PerformedSet[],
): { weight: number; reps: number } | null {
  let best: { weight: number; reps: number } | null = null;
  for (const set of sets) {
    const weight = numericWeight(set.weight);
    if (weight === null) continue;
    if (
      best === null ||
      weight > best.weight ||
      (weight === best.weight && set.reps > best.reps)
    )
      best = { weight, reps: set.reps };
  }
  return best;
}

/**
 * `entries` is what is being saved (sessionEntries) and `before` the logs that existed before it. An exercise with no
 * earlier numeric weight has nothing to beat, so its first time is not called a record.
 */
export function summarizeSession(
  entries: readonly (readonly [string, readonly PerformedSet[]])[],
  before: readonly WorkoutLogDoc[],
): SessionSummary {
  const records: SessionRecord[] = [];
  for (const [exercise, sets] of entries) {
    const today = heaviest(sets);
    if (today === null) continue;
    let previousBest: number | null = null;
    for (const log of before) {
      if (log.exerciseName !== exercise) continue;
      const past = heaviest(decodePerformedSets(log.performedSetsJson));
      if (
        past !== null &&
        (previousBest === null || past.weight > previousBest)
      )
        previousBest = past.weight;
    }
    if (previousBest !== null && today.weight > previousBest)
      records.push({
        exercise,
        weight: today.weight,
        reps: today.reps,
        previousBest,
      });
  }
  return {
    exercises: entries.length,
    sets: entries.reduce((total, [, sets]) => total + sets.length, 0),
    records,
  };
}
