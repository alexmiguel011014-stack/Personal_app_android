import { collection, deleteDoc, doc, getDocs, query, setDoc, where, writeBatch, type Firestore } from "firebase/firestore";
import type { Exercise } from "../domain/exercise";
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
