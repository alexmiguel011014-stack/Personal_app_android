import type { Exercise } from "./exercise";
import { isKotlinBlank, kotlinTrim } from "./kotlin";

// GOALS.md §25e — editing a treino in the review screen before it is saved. The pasted text is read
// ONCE, when it is pasted; from then on the screen works on plain data, so changing a name, the sets
// or the reps cannot disturb the reading, and "Salvar" stores exactly what is on screen. These are the
// small pure rules behind those edits.

export const MAX_SETS = 99;

/** "4" → 4; anything that is not a whole number from 1 to 99 → null (the field shows it as invalid). */
export function parseSetsText(text: string): number | null {
  const trimmed = kotlinTrim(text);
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const sets = Number(trimmed);
  return sets >= 1 && sets <= MAX_SETS ? sets : null;
}

/**
 * Renaming an exercise drops its muscle activation: the numbers belonged to the exercise the AI named,
 * and a different exercise has different ones. A visible "sem ativação muscular" is more honest than a
 * stale figure feeding the weekly volume. Changing only spaces keeps it.
 */
export function renamedExercise(exercise: Exercise, name: string): Exercise {
  const same = kotlinTrim(name) === kotlinTrim(exercise.name);
  return { ...exercise, name, muscleActivation: same ? exercise.muscleActivation : null };
}

/** What a treino's exercises must satisfy before it is saved, in the trainer's words. */
export function exerciseErrors(exercises: readonly Exercise[]): string[] {
  const errors: string[] = [];
  exercises.forEach((exercise, index) => {
    if (isKotlinBlank(exercise.name)) errors.push(`o exercício ${index + 1} está sem nome`);
  });
  return errors;
}

/** The exercises as they are stored: names and reps trimmed. */
export function tidied(exercises: readonly Exercise[]): Exercise[] {
  return exercises.map((exercise) => ({
    ...exercise,
    name: kotlinTrim(exercise.name),
    reps: kotlinTrim(exercise.reps),
  }));
}
