import { withDerivedStatus, type Workout } from "./workouts";

// GOALS.md §28 — replacing a student's ficha keeps only the previous one. A "ficha" here is the set of a
// student's ACTIVE treinos; "replacing" it, in one batch, archives those (they become the history),
// deletes the history that was already there, and creates the new treinos.
//
// The delete is bounded by construction, and this file is where the bound lives: the only treinos it
// ever lists for deletion are INACTIVE ones that already carry `archivedAt` — the ones the previous
// replacement archived. A draft the trainer prepared, a treino deactivated by hand, anything the phone
// wrote: never candidates. And nothing is deleted at all unless something is archived in the same
// replacement, so a replace can never leave a student with an empty history by deleting the only one.

/** Firestore allows 500 writes in a batch; the plan refuses long before that. */
export const MAX_REPLACEMENT_OPERATIONS = 450;

export interface ReplacementPlan {
  /** The new treinos, active. */
  toCreate: Workout[];
  /** The current treinos as they are written back: inactive, a draft, `archivedAt` = now. */
  toArchive: Workout[];
  /** The history from the previous replacement, to be removed. */
  toDelete: Workout[];
}

/** The student page's three groups: what they see today, the history, and every other inactive treino. */
export function splitFichas(workouts: readonly Workout[]): { current: Workout[]; history: Workout[]; others: Workout[] } {
  const current = currentFicha(workouts);
  const history = historyFicha(workouts);
  const others = workouts.filter((workout) => !workout.isActive && workout.archivedAt === null);
  return { current, history, others };
}

/** The student's current ficha: what they see today. */
export function currentFicha(workouts: readonly Workout[]): Workout[] {
  return workouts.filter((workout) => workout.isActive);
}

/**
 * The "ficha anterior": retired by a replacement and still inactive. The `isActive` check is the guard
 * for a treino that was re-activated by a writer that kept `archivedAt` (a merge-write): it is current
 * again, so it is not history and is never deleted.
 */
export function historyFicha(workouts: readonly Workout[]): Workout[] {
  return workouts.filter((workout) => workout.archivedAt !== null && !workout.isActive);
}

export function planReplacement(
  existing: readonly Workout[],
  incoming: readonly Workout[],
  now: number,
): ReplacementPlan {
  const current = currentFicha(existing);
  const toArchive = current.map((workout) => ({
    ...withDerivedStatus({ ...workout, isActive: false }, now),
    archivedAt: now,
  }));
  const toDelete = current.length > 0 ? historyFicha(existing) : [];
  const toCreate = incoming.map((workout) => withDerivedStatus({ ...workout, isActive: true, archivedAt: null }, now));

  // A treino in two lists would be written and deleted in the same batch: a bug, never a case to handle.
  const seen = new Set<string>();
  for (const workout of [...toCreate, ...toArchive, ...toDelete]) {
    if (seen.has(workout.id)) throw new Error(`Treino ${workout.id} is in more than one list of the replacement.`);
    seen.add(workout.id);
  }
  return { toCreate, toArchive, toDelete };
}

export function replacementOperations(plan: ReplacementPlan): number {
  return plan.toCreate.length + plan.toArchive.length + plan.toDelete.length;
}
