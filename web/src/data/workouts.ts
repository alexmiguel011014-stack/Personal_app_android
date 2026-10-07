import { collection, doc, getDocs, query, where, writeBatch, type Firestore } from "firebase/firestore";
import type { Exercise } from "../domain/exercise";
import { fichaSaveErrors, groupFichas, planNewFicha, type Ficha } from "../domain/fichas";
import { kotlinTrim } from "../domain/kotlin";
import { withDerivedStatus, type Workout } from "../domain/workouts";
import { toWorkout, workoutToFirestore } from "./converters";

// GOALS.md §23g/§34: treinos and fichas. A treino is one `workouts/{id}` document (WorkoutEntity); the status is
// derived on every save, exactly as SqlDelightTrainerRepository does. A ficha is a named set of treinos (§34, below).

/** One student's treinos, newest first. Two equality filters: no composite index needed. */
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
 * The signed-in student's own treinos — StudentRepository.getMyWorkouts' query exactly: assigned
 * ones only, which is also all firestore.rules let them read. The page groups them with `groupFichas`.
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

/** A new treino, active from the start — both Android creation screens pass isActive = true. */
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
    ficha: null,
  };
}

// ---------------------------------------------------------------------------------------------
// GOALS.md §34 — fichas: a named set of treinos, at most two per student. Every write below is ONE batch, so a ficha
// is created, changed or deleted whole or not at all. A client transaction cannot run a query, so two tabs saving at
// the same instant could leave three fichas — never lost data.

/** Firestore allows 500 writes in a batch; a ficha operation refuses long before that (it must stay atomic, never split). */
export const MAX_FICHA_OPERATIONS = 450;

/** Too many treinos to write and delete in one batch — never expected, refused rather than split. */
export class FichaTooLarge extends Error {}

/** The ficha is no longer there (deleted from another tab or device): the screen reloads its list. */
export class FichaNotFound extends Error {}

/** What the editor hands over for a new ficha: its name and its treinos, nothing else. */
export interface FichaDraft {
  name: string;
  treinos: { name: string; exercises: Exercise[] }[];
}

/** What the editor hands over for an existing ficha: `id` is the treino's own, or null for one added in the editor. */
export interface FichaEdit {
  name: string;
  treinos: { id: string | null; name: string; exercises: Exercise[] }[];
}

/** One student's fichas, newest first. A legacy (pre-ficha) treino set reads as one virtual ficha; see domain/fichas.ts. */
export async function loadStudentFichas(db: Firestore, trainerId: string, studentId: string): Promise<Ficha[]> {
  return groupFichas(await loadStudentWorkouts(db, trainerId, studentId));
}

function refuseInvalid(draft: FichaDraft): void {
  const errors = fichaSaveErrors(draft.name, draft.treinos);
  if (errors.length > 0) throw new Error(errors.join(" "));
}

function refuseTooLarge(operations: number): void {
  if (operations > MAX_FICHA_OPERATIONS) {
    throw new FichaTooLarge(`A ficha operation of ${operations} writes does not fit one batch.`);
  }
}

/**
 * Creates a ficha. If the student already has two, the oldest one (by creation) and every treino of it are deleted in
 * the same batch — the bound is `planNewFicha`'s: nothing but the oldest fichas' own treinos, never another student's,
 * never a hidden legacy treino, never a `workoutLog`.
 */
export async function createFicha(
  db: Firestore,
  trainerId: string,
  studentId: string,
  draft: FichaDraft,
  now: number,
): Promise<{ created: Ficha; deleted: Ficha[] }> {
  refuseInvalid(draft);
  const name = kotlinTrim(draft.name);
  const fichaId = crypto.randomUUID();
  const incoming = draft.treinos.map((treino, index) =>
    withDerivedStatus(
      {
        ...newWorkout(trainerId, studentId, kotlinTrim(treino.name), treino.exercises, now),
        ficha: { id: fichaId, name, createdAt: now, updatedAt: now, order: index },
      },
      now,
    ),
  );
  const plan = planNewFicha(await loadStudentWorkouts(db, trainerId, studentId), incoming);
  refuseTooLarge(plan.toCreate.length + plan.toDelete.length);
  const batch = writeBatch(db);
  for (const workout of plan.toCreate) batch.set(doc(db, "workouts", workout.id), workoutToFirestore(workout, trainerId));
  for (const workout of plan.toDelete) batch.delete(doc(db, "workouts", workout.id));
  await batch.commit();
  return { created: groupFichas(plan.toCreate)[0], deleted: groupFichas(plan.toDelete) };
}

/**
 * Saves changes to an existing ficha (name, treinos): kept treinos keep their `createdAt`/`assignedAt`, treinos without
 * an id are created, treinos of the ficha that are not in the edit are deleted, and every one written carries the
 * ficha's map with `updatedAt = now`. Saving the legacy ficha ADOPTS it: it gets a new `ficha.id` and the typed name and
 * keeps its place in the order. A treino id that is not in this ficha is refused before anything is written.
 */
export async function saveFicha(
  db: Firestore,
  trainerId: string,
  studentId: string,
  fichaId: string,
  edit: FichaEdit,
  now: number,
): Promise<Ficha> {
  refuseInvalid(edit);
  const ficha = groupFichas(await loadStudentWorkouts(db, trainerId, studentId)).find((f) => f.id === fichaId);
  if (ficha === undefined) throw new FichaNotFound(`Ficha ${fichaId} not found.`);

  const members = new Map(ficha.treinos.map((treino) => [treino.id, treino]));
  const kept = new Set<string>();
  for (const treino of edit.treinos) {
    if (treino.id === null) continue;
    if (!members.has(treino.id)) throw new Error(`Treino ${treino.id} does not belong to ficha ${fichaId}.`);
    if (kept.has(treino.id)) throw new Error(`Treino ${treino.id} is listed twice.`);
    kept.add(treino.id);
  }

  const name = kotlinTrim(edit.name);
  const id = ficha.legacy ? crypto.randomUUID() : ficha.id;
  const toWrite = edit.treinos.map((treino, index) => {
    const base = treino.id === null ? newWorkout(trainerId, studentId, "", [], now) : members.get(treino.id)!;
    return withDerivedStatus(
      {
        ...base,
        name: kotlinTrim(treino.name),
        exercises: treino.exercises,
        isActive: true,
        ficha: { id, name, createdAt: ficha.createdAt, updatedAt: now, order: index },
      },
      now,
    );
  });
  const toDelete = ficha.treinos.filter((treino) => !kept.has(treino.id));
  refuseTooLarge(toWrite.length + toDelete.length);
  const batch = writeBatch(db);
  for (const workout of toWrite) batch.set(doc(db, "workouts", workout.id), workoutToFirestore(workout, trainerId));
  for (const workout of toDelete) batch.delete(doc(db, "workouts", workout.id));
  await batch.commit();
  return groupFichas(toWrite)[0];
}

/**
 * Deletes a ficha: exactly the treinos `groupFichas` puts in it (the legacy ficha: the active legacy ones), in one
 * batch. The student's `workoutLogs`, hidden legacy treinos and other students' treinos are never touched.
 */
export async function deleteFicha(db: Firestore, trainerId: string, studentId: string, fichaId: string): Promise<void> {
  const ficha = groupFichas(await loadStudentWorkouts(db, trainerId, studentId)).find((f) => f.id === fichaId);
  if (ficha === undefined) throw new FichaNotFound(`Ficha ${fichaId} not found.`);
  refuseTooLarge(ficha.treinos.length);
  const batch = writeBatch(db);
  for (const workout of ficha.treinos) batch.delete(doc(db, "workouts", workout.id));
  await batch.commit();
}
