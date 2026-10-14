import { collection, doc, query, where, writeBatch, type Firestore } from "firebase/firestore";
import { getDocs } from "./firestoreRead";
import { encodePerformedSets, type PerformedSet } from "../domain/exercise";
import type { WorkoutLogDoc } from "../domain/metrics";
import { toWorkoutLog, workoutLogToFirestore } from "./converters";

// GOALS.md §23h: the student's training sessions — one workoutLogs document per exercise, as
// StudentViewModel.logSession writes them (see domain/metrics.ts for why that matters).

/**
 * The signed-in student's own logs — StudentRepository.getMyWorkoutLogs. GOALS.md §38b: with `from`, only those
 * dated from then on (the (studentId, date) index); without it, the whole history, read when the aluno asks.
 */
export async function loadMyLogs(db: Firestore, studentId: string, from?: number): Promise<WorkoutLogDoc[]> {
  const mine = where("studentId", "==", studentId);
  const snapshot = await getDocs(
    from === undefined
      ? query(collection(db, "workoutLogs"), mine)
      : query(collection(db, "workoutLogs"), mine, where("date", ">=", from)),
  );
  return snapshot.docs.map((document) => toWorkoutLog(document.id, document.data())).filter((log) => log !== null);
}

/**
 * GOALS.md §38c (U7, D12): correct a session the aluno logged — one batch, so it is corrected whole or not at all. An
 * exercise that already has its log keeps the document (and its time) and gets the new sets, written as a partial
 * update; a new exercise gets a document dated just after the session's last one; an exercise whose rows were all
 * emptied loses its document. `existing` is the session's current logs; `entries` as `sessionEntries` builds them.
 */
export async function updateSession(
  db: Firestore,
  studentId: string,
  trainerId: string,
  workoutId: string,
  existing: readonly WorkoutLogDoc[],
  entries: readonly (readonly [string, PerformedSet[]])[],
): Promise<void> {
  const leftover = new Map(existing.map((log) => [log.exerciseName, log]));
  const after = existing.reduce((latest, log) => Math.max(latest, log.date), 0) + 1;
  const batch = writeBatch(db);
  let added = 0;
  for (const [exerciseName, sets] of entries) {
    const found = leftover.get(exerciseName);
    if (found) {
      batch.update(doc(db, "workoutLogs", found.id), { performedSetsJson: encodePerformedSets(sets) });
      leftover.delete(exerciseName);
    } else {
      const log: WorkoutLogDoc = {
        id: crypto.randomUUID(),
        trainerId,
        studentId,
        workoutId,
        exerciseName,
        date: after + added++,
        performedSetsJson: encodePerformedSets(sets),
        note: null,
      };
      batch.set(doc(db, "workoutLogs", log.id), workoutLogToFirestore(log));
    }
  }
  for (const log of leftover.values()) batch.delete(doc(db, "workoutLogs", log.id));
  await batch.commit();
}

/** GOALS.md §38c (U7): delete a whole session — all its logs in one batch. The progress charts of the other days are untouched. */
export async function deleteSession(db: Firestore, logs: readonly WorkoutLogDoc[]): Promise<void> {
  const batch = writeBatch(db);
  for (const log of logs) batch.delete(doc(db, "workoutLogs", log.id));
  await batch.commit();
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
