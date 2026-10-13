import { collection, doc, query, setDoc, where, type Firestore } from "firebase/firestore";
import { getDocs } from "./firestoreRead";
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
 * GOALS.md §38b: every measurement of the trainer's alunos dated in [from, to) — "Registros" reads its window with
 * one query instead of one per aluno. Needs the (trainerId, date) index.
 */
export async function loadTrainerBiometrics(db: Firestore, trainerId: string, from: number, to?: number): Promise<Biometric[]> {
  const range = [where("date", ">=", from), ...(to === undefined ? [] : [where("date", "<", to)])];
  const snapshot = await getDocs(query(collection(db, "biometrics"), where("trainerId", "==", trainerId), ...range));
  return snapshot.docs
    .map((document) => toBiometric(document.id, document.data()))
    .filter((biometric) => biometric !== null);
}

/** The signed-in student's own measurements, newest first — StudentRepository.getMyBiometrics. */
export async function loadMyBiometrics(db: Firestore, studentId: string): Promise<Biometric[]> {
  const snapshot = await getDocs(query(collection(db, "biometrics"), where("studentId", "==", studentId)));
  return snapshot.docs
    .map((document) => toBiometric(document.id, document.data()))
    .filter((biometric) => biometric !== null)
    .sort((a, b) => b.date - a.date);
}

/**
 * StudentViewModel.logOwnBiometric: the student's own measurement, attributed to their trainer.
 * firestore.rules allow it only while the trainer has granted canLogBiometrics.
 */
export async function logOwnBiometric(
  db: Firestore,
  studentId: string,
  trainerId: string,
  measurement: { weight: number; bodyFat: number },
  now: number,
): Promise<Biometric> {
  return addBiometric(db, trainerId, studentId, measurement, now);
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
