import { collection, doc, getDocs, query, where, writeBatch, type Firestore } from "firebase/firestore";
import { encodePerformedSets, type PerformedSet } from "../domain/exercise";
import type { WorkoutLogDoc } from "../domain/metrics";
import { toWorkoutLog, workoutLogToFirestore } from "./converters";

// GOALS.md §23h: the student's training sessions — one workoutLogs document per exercise, as
// StudentViewModel.logSession writes them (see domain/metrics.ts for why that matters).

/** The signed-in student's own logs — StudentRepository.getMyWorkoutLogs. */
export async function loadMyLogs(db: Firestore, studentId: string): Promise<WorkoutLogDoc[]> {
  const snapshot = await getDocs(query(collection(db, "workoutLogs"), where("studentId", "==", studentId)));
  return snapshot.docs.map((document) => toWorkoutLog(document.id, document.data())).filter((log) => log !== null);
}

/**
 * One document per exercise, attributed to the student's trainer (firestore.rules check it against
 * the student's own profile). The phone stamps each with its own clock reading inside a loop; here
 * they're `now` plus the exercise's position, a millisecond apart — same day, same order. One batch,
 * so a session is saved whole or not at all (the phone writes them one by one).
 */
export async function logSession(
  db: Firestore,
  studentId: string,
  trainerId: string,
  workoutId: string,
  entries: readonly (readonly [string, PerformedSet[]])[],
  now: number,
): Promise<WorkoutLogDoc[]> {
  const logs: WorkoutLogDoc[] = entries.map(([exerciseName, sets], index) => ({
    id: crypto.randomUUID(),
    trainerId,
    studentId,
    workoutId,
    exerciseName,
    date: now + index,
    performedSetsJson: encodePerformedSets(sets),
    note: null,
  }));
  const batch = writeBatch(db);
  for (const log of logs) batch.set(doc(db, "workoutLogs", log.id), workoutLogToFirestore(log));
  await batch.commit();
  return logs;
}
