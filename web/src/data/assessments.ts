import { collection, doc, query, serverTimestamp, where, writeBatch, type Firestore } from "firebase/firestore";
import { getDocs } from "./firestoreRead";
import type { AnamnesisRecord } from "../domain/anamnesis";
import { encodeParQAnswers, type Assessment } from "../domain/assessments";
import { toAssessment } from "./converters";

// GOALS.md §23g: a student's PAR-Q+ self-assessments, read by their trainer (the student writes them,
// §23h).

/** GOALS.md §38g: the web-only part of an anamnese — the answers, and the wording of the consent that came with them. */
export interface AnamnesisSubmission {
  record: AnamnesisRecord;
  consentVersion: string;
}

/**
 * StudentRepository.submitAssessment: the new assessment and, in the same batch, the answered
 * request cleared on the student's profile. firestore.rules allow that flag to go false only when
 * `lastAssessmentId` names an assessment this very batch creates — a request can't be dismissed
 * without answering it.
 *
 * With `anamnesis` (GOALS.md §38g) the same document also carries the anamnese's answers, the consent version and
 * `consentAt` — the server's time, never the device's. The phone ignores those fields and a plain PAR-Q+ has none.
 */
export async function submitAssessment(
  db: Firestore,
  studentId: string,
  trainerId: string,
  answers: Readonly<Record<string, boolean>>,
  profile: { goal: string; experienceLevel: string; trainingDays: string[] },
  now: number,
  anamnesis?: AnamnesisSubmission,
): Promise<string> {
  const id = crypto.randomUUID();
  const batch = writeBatch(db);
  batch.set(doc(db, "assessments", id), {
    trainerId,
    studentId,
    submittedAt: now,
    parQAnswersJson: encodeParQAnswers(answers),
    goal: profile.goal,
    experienceLevel: profile.experienceLevel,
    trainingDays: profile.trainingDays,
    ...(anamnesis === undefined
      ? {}
      : {
          anamnesis: { version: anamnesis.record.version, answers: anamnesis.record.answers },
          consentVersion: anamnesis.consentVersion,
          consentAt: serverTimestamp(),
        }),
  });
  batch.update(doc(db, "users", studentId), { pendingAssessmentRequest: false, lastAssessmentId: id });
  await batch.commit();
  return id;
}

/**
 * GOALS.md §38b: the trainer's alunos' self-assessments sent in [from, to) — "Registros" reads its window with one
 * query instead of one per aluno. Needs the (trainerId, submittedAt) index.
 */
export async function loadTrainerAssessments(db: Firestore, trainerId: string, from: number, to?: number): Promise<Assessment[]> {
  const range = [where("submittedAt", ">=", from), ...(to === undefined ? [] : [where("submittedAt", "<", to)])];
  const snapshot = await getDocs(query(collection(db, "assessments"), where("trainerId", "==", trainerId), ...range));
  return snapshot.docs
    .map((document) => toAssessment(document.id, document.data()))
    .filter((assessment) => assessment !== null);
}

/** The signed-in student's own assessments, newest first — one equality filter, no index. */
export async function loadMyAssessments(db: Firestore, studentId: string): Promise<Assessment[]> {
  const snapshot = await getDocs(query(collection(db, "assessments"), where("studentId", "==", studentId)));
  return snapshot.docs
    .map((document) => toAssessment(document.id, document.data()))
    .filter((assessment) => assessment !== null)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}

/** One student's self-assessments, newest first. */
export async function loadStudentAssessments(db: Firestore, trainerId: string, studentId: string): Promise<Assessment[]> {
  const snapshot = await getDocs(
    query(collection(db, "assessments"), where("trainerId", "==", trainerId), where("studentId", "==", studentId)),
  );
  return snapshot.docs
    .map((document) => toAssessment(document.id, document.data()))
    .filter((assessment) => assessment !== null)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}
