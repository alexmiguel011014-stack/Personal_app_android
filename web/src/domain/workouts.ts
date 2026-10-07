import type { Exercise } from "./exercise";
import { isKotlinBlank, kotlinTrim, toIntOrNull } from "./kotlin";
import { parseExercises, parseWorkoutName } from "./workoutParser";

// GOALS.md §23g: a ficha — Firestore `workouts/{id}`, mirroring WorkoutEntity and FirestoreMappers.

export type WorkoutStatus = "draft" | "assigned";

/**
 * GOALS.md §34: which ficha a treino belongs to — web-only, one map so it is all-or-nothing. A ficha is the set of
 * treinos that share `id`; `name`/`createdAt`/`updatedAt` are repeated on each member and `order` is the treino's
 * place inside it. The phone neither reads nor writes it, and a phone save drops it (that treino then reads as a
 * legacy one: no membership).
 */
export interface FichaMembership {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface Workout {
  id: string;
  trainerId: string;
  studentId: string;
  name: string;
  /** The one flag the trainer actually toggles; `status` follows from it. */
  isActive: boolean;
  exercises: Exercise[];
  createdAt: number;
  status: WorkoutStatus;
  assignedAt: number | null;
  /** GOALS.md §34: null on every document the phone wrote and on treinos that predate fichas (they read as the legacy ficha). */
  ficha: FichaMembership | null;
}

/**
 * SqlDelightTrainerRepository.withDerivedStatus, applied before every save: active means
 * "assigned" (and keeps the first assignment time), inactive means "draft". It matters beyond
 * bookkeeping — firestore.rules let a student read only their *assigned* fichas, so a ficha saved
 * without this stays invisible to them forever (the Kotlin comment says exactly that).
 */
export function withDerivedStatus(workout: Workout, now: number): Workout {
  return workout.isActive
    ? { ...workout, status: "assigned", assignedAt: workout.assignedAt ?? now }
    : { ...workout, status: "draft", assignedAt: null };
}

/** The Android save rule (PromptFichaScreen, ManualWorkoutScreen): a name and at least one exercise. */
export function workoutErrors(name: string, exercises: readonly Exercise[]): string[] {
  const errors: string[] = [];
  if (isKotlinBlank(name)) errors.push("Nome do treino é obrigatório.");
  if (exercises.length === 0) errors.push("Adicione pelo menos um exercício.");
  return errors;
}

/**
 * Smart Paste into a ficha being edited, as both Android screens do it: a recognised name fills
 * the name only while it's still blank (it never overwrites what the trainer typed), and
 * recognised exercises replace the list; text with neither changes nothing.
 */
export function applyPaste(
  text: string,
  current: { name: string; exercises: Exercise[] },
): { name: string; exercises: Exercise[] } {
  const parsedName = parseWorkoutName(text);
  const parsed = parseExercises(text);
  return {
    name: parsedName !== null && isKotlinBlank(current.name) ? parsedName : current.name,
    exercises: parsed.length > 0 ? parsed : current.exercises,
  };
}

/**
 * ManualWorkoutComponents' "Adicionar": name, sets and reps, nothing else. Two deliberate
 * tightenings: the Android dialog silently stores non-numeric sets as 0 (here it's an error), and
 * stores the text untrimmed (here it's trimmed). Same stored shape — the phone reads what this
 * produces.
 */
export function manualExercise(
  name: string,
  setsText: string,
  reps: string,
): { exercise: Exercise } | { error: string } {
  if (isKotlinBlank(name)) return { error: "Nome é obrigatório." };
  const sets = toIntOrNull(kotlinTrim(setsText));
  if (sets === null || sets <= 0) return { error: "Séries precisa ser um número maior que zero." };
  return {
    exercise: {
      name: kotlinTrim(name),
      sets,
      reps: kotlinTrim(reps),
      weight: null,
      restSeconds: null,
      notes: null,
      muscleActivation: null,
    },
  };
}
