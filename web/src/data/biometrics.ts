import { collection, doc, getDocs, query, setDoc, where, type Firestore } from "firebase/firestore";
import type { Biometric } from "../domain/biometrics";
import { biometricToFirestore, toBiometric } from "./converters";

// GOALS.md §23g: a student's measurements, as the trainer sees and records them.

/** One student's measurements, newest first. Two equality filters: no composite index needed. */
export async function loadStudentBiometrics(db: Firestore, trainerId: string, studentId: string): Promise<Biometric[]> {
  const snapshot = await getDocs(
    query(collection(db, "biometrics"), where("trainerId", "==", trainerId), where("studentId", "==", studentId)),
  );
  return snapshot.docs
    .map((document) => toBiometric(document.id, document.data()))
    .filter((biometric) => biometric !== null)
    .sort((a, b) => b.date - a.date);
}

/**
 * StudentDetailsViewModel.addBiometric, minus a bug: the phone fills `height` by parsing the
 * student's *medical notes* as a number, so it's 0 unless the notes happen to be one. Height is
 * never shown anywhere and the student's own measurements already store 0 — so here it's 0.
 */
export async function addBiometric(
  db: Firestore,
  trainerId: string,
  studentId: string,
  measurement: { weight: number; bodyFat: number },
  now: number,
): Promise<Biometric> {
  const biometric: Biometric = {
    id: crypto.randomUUID(),
    trainerId,
    studentId,
    weight: measurement.weight,
    height: 0,
    bodyFat: measurement.bodyFat,
    date: now,
  };
  await setDoc(doc(db, "biometrics", biometric.id), biometricToFirestore(biometric, trainerId));
  return biometric;
}
