import { collection, deleteDoc, doc, query, setDoc, where, type Firestore } from "firebase/firestore";
import { getDocs } from "./firestoreRead";
import type { Schedule } from "../domain/schedules";
import { scheduleToFirestore, toSchedule } from "./converters";

// GOALS.md §23g: the trainer's weekly agenda — TrainerRepository's insertSchedule / deleteSchedule.

export async function loadSchedules(db: Firestore, trainerId: string): Promise<Schedule[]> {
  const snapshot = await getDocs(query(collection(db, "schedules"), where("trainerId", "==", trainerId)));
  return snapshot.docs.map((document) => toSchedule(document.id, document.data())).filter((schedule) => schedule !== null);
}

/** TrainerViewModel.bookSlot: a new document per booking, as the phone writes it. */
export async function bookSlot(
  db: Firestore,
  trainerId: string,
  studentId: string,
  dayOfWeek: string,
  hour: string,
): Promise<Schedule> {
  const schedule: Schedule = { id: crypto.randomUUID(), trainerId, studentId, dayOfWeek, hour };
  await setDoc(doc(db, "schedules", schedule.id), scheduleToFirestore(schedule, trainerId));
  return schedule;
}

/** The phone's repository has this; its screen never offers it — here a wrong booking can be undone. */
export async function removeBooking(db: Firestore, scheduleId: string): Promise<void> {
  await deleteDoc(doc(db, "schedules", scheduleId));
}

/**
 * GOALS.md §38f: the aluno's own weekly appointments — what the trainer booked for them, a handful of documents. The
 * Rules let a student read the schedules whose `studentId` is theirs, and the query says so.
 */
export async function loadMySchedules(db: Firestore, uid: string): Promise<Schedule[]> {
  const snapshot = await getDocs(query(collection(db, "schedules"), where("studentId", "==", uid)));
  return snapshot.docs.map((document) => toSchedule(document.id, document.data())).filter((schedule) => schedule !== null);
}

/** GOALS.md §38i: one aluno's weekly appointments, for the personal's page about them — a handful of documents, two equality filters, no index. */
export async function loadStudentSchedules(db: Firestore, trainerId: string, studentId: string): Promise<Schedule[]> {
  const snapshot = await getDocs(
    query(collection(db, "schedules"), where("trainerId", "==", trainerId), where("studentId", "==", studentId)),
  );
  return snapshot.docs.map((document) => toSchedule(document.id, document.data())).filter((schedule) => schedule !== null);
}
