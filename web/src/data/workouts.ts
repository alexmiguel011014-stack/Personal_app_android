import { collection, deleteDoc, doc, getDocs, query, setDoc, where, type Firestore } from "firebase/firestore";
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

export async function deleteWorkout(db: Firestore, workoutId: string): Promise<void> {
  await deleteDoc(doc(db, "workouts", workoutId));
}
