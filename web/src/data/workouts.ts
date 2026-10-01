import { collection, deleteDoc, doc, getDocs, query, setDoc, where, writeBatch, type Firestore } from "firebase/firestore";
import type { Exercise } from "../domain/exercise";
import { MAX_REPLACEMENT_OPERATIONS, planReplacement, replacementOperations } from "../domain/fichaHistory";
import { withDerivedStatus, type Workout } from "../domain/workouts";
import { toWorkout, workoutToFirestore } from "./converters";

// GOALS.md §23g: fichas — ports of SqlDelightTrainerRepository's insertWorkout / updateWorkout /
// deleteWorkout: the status is derived on every save, exactly as there.

/** One student's fichas, newest first. Two equality filters: no composite index needed. */
export async function loadStudentWorkouts(db: Firestore, trainerId: string, studentId: string): Promise<Workout[]> {
  const snapshot = await getDocs(
    query(collection(db, "workouts"), where("trainerId", "==", trainerId), where("studentId", "==", studentId)),
  );
  return snapshot.docs
    .map((document) => toWorkout(document.id, document.data()))
    .filter((workout) => workout !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * The signed-in student's own fichas — StudentRepository.getMyWorkouts' query exactly: assigned
 * ones only, which is also all firestore.rules let them read. Sorted by name ("Ficha A", "Ficha B").
 */
export async function loadMyWorkouts(db: Firestore, studentId: string): Promise<Workout[]> {
  const snapshot = await getDocs(
    query(collection(db, "workouts"), where("studentId", "==", studentId), where("status", "==", "assigned")),
  );
  return snapshot.docs
    .map((document) => toWorkout(document.id, document.data()))
    .filter((workout) => workout !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** A new ficha, active from the start — both Android creation screens pass isActive = true. */
export function newWorkout(trainerId: string, studentId: string, name: string, exercises: Exercise[], now: number): Workout {
  return {
    id: crypto.randomUUID(),
    trainerId,
    studentId,
    name,
    isActive: true,
    exercises,
    createdAt: now,
    status: "draft",
    assignedAt: null,
    archivedAt: null,
  };
}

export async function saveWorkout(db: Firestore, trainerId: string, workout: Workout, now: number): Promise<Workout> {
  const toSave = withDerivedStatus(workout, now);
  await setDoc(doc(db, "workouts", toSave.id), workoutToFirestore(toSave, trainerId));
  return toSave;
}

/**
 * GOALS.md §25e: several fichas of one answer (Treino A, B, C…) in a single batch, so they are all
 * saved or none — a half-saved ABC is worse than a failed save. Each goes through the same status
 * derivation and mapping as `saveWorkout`; the phone reads these exactly like fichas made one by one.
 */
export async function saveWorkouts(db: Firestore, trainerId: string, workouts: readonly Workout[], now: number): Promise<Workout[]> {
  const toSave = workouts.map((workout) => withDerivedStatus(workout, now));
  const batch = writeBatch(db);
  for (const workout of toSave) batch.set(doc(db, "workouts", workout.id), workoutToFirestore(workout, trainerId));
  await batch.commit();
  return toSave;
}

export async function deleteWorkout(db: Firestore, workoutId: string): Promise<void> {
  await deleteDoc(doc(db, "workouts", workoutId));
}

/** Too many treinos to replace in one batch — never expected, refused rather than split (it must stay atomic). */
export class ReplacementTooLarge extends Error {}

/** What a replacement did, as treino names, for the screen to say. */
export interface ReplacementResult {
  created: string[];
  archived: string[];
  deleted: string[];
}

/**
 * GOALS.md §28: replace a student's ficha — the new treinos are created, the current (active) ones are
 * archived as the "ficha anterior", and the previous history is deleted, all in ONE batch: all of it
 * happens or none of it does. What may be deleted is decided in domain/fichaHistory.ts (only inactive
 * treinos a previous replacement archived, and only when something is archived now). The student's
 * treinos are read once and written once; a transaction cannot run a query in the client SDK, so two
 * tabs replacing at the same instant could leave two active fichas — never lost data.
 */
export async function replaceFicha(
  db: Firestore,
  trainerId: string,
  studentId: string,
  incoming: readonly Workout[],
  now: number,
): Promise<ReplacementResult> {
  if (incoming.some((workout) => workout.studentId !== studentId)) {
    throw new Error("A new treino belongs to another student than the one being replaced.");
  }
  const plan = planReplacement(await loadStudentWorkouts(db, trainerId, studentId), incoming, now);
  if (replacementOperations(plan) > MAX_REPLACEMENT_OPERATIONS) {
    throw new ReplacementTooLarge(`A replacement of ${replacementOperations(plan)} treinos does not fit one batch.`);
  }
  const batch = writeBatch(db);
  for (const workout of [...plan.toCreate, ...plan.toArchive]) {
    batch.set(doc(db, "workouts", workout.id), workoutToFirestore(workout, trainerId));
  }
  for (const workout of plan.toDelete) batch.delete(doc(db, "workouts", workout.id));
  await batch.commit();
  const names = (list: readonly Workout[]) => list.map((workout) => workout.name);
  return { created: names(plan.toCreate), archived: names(plan.toArchive), deleted: names(plan.toDelete) };
}
