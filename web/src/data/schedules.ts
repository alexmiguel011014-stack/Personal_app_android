import { collection, deleteDoc, doc, getDocs, query, setDoc, where, type Firestore } from "firebase/firestore";
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
