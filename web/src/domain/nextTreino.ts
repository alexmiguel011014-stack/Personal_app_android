import type { Ficha } from "./fichas";
import type { WorkoutLogDoc } from "./metrics";
import type { Workout } from "./workouts";

// GOALS.md §38f (U8, D11): which treino the aluno does next — the one after the treino they trained last in their
// current ficha, wrapping round; the first one when none of it has been trained (or nothing is in the window).

export interface NextTreino {
  treino: Workout;
  ficha: Ficha;
  /** The treino trained last in this ficha, when there is one ("Depois do Treino A"). */
  after: Workout | null;
}

/**
 * `fichas` are the aluno's fichas, newest first (`groupFichas`); the newest is the current one. Logs of a treino that no
 * longer exists, or that belongs to another ficha, say nothing about where this one stands and are ignored. A ficha of
 * a single treino always comes back to itself.
 */
export function nextTreino(
  fichas: readonly Ficha[],
  logs: readonly WorkoutLogDoc[],
): NextTreino | null {
  const ficha = fichas[0];
  if (!ficha || ficha.treinos.length === 0) return null;

  const position = new Map(
    ficha.treinos.map((treino, index) => [treino.id, index]),
  );
  let last: WorkoutLogDoc | null = null;
  for (const log of logs) {
    if (!position.has(log.workoutId)) continue;
    if (last === null || log.date > last.date) last = log;
  }
  if (last === null) return { treino: ficha.treinos[0], ficha, after: null };

  const index = position.get(last.workoutId) as number;
  return {
    treino: ficha.treinos[(index + 1) % ficha.treinos.length],
    ficha,
    after: ficha.treinos[index],
  };
}
