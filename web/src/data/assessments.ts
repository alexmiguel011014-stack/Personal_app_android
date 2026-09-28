import { collection, doc, getDocs, query, where, writeBatch, type Firestore } from "firebase/firestore";
import { encodeParQAnswers, type Assessment } from "../domain/assessments";
import { toAssessment } from "./converters";

// GOALS.md §23g: a student's PAR-Q+ self-assessments, read by their trainer (the student writes them,
// §23h).

/**
 * StudentRepository.submitAssessment: the new assessment and, in the same batch, the answered
 * request cleared on the student's profile. firestore.rules allow that flag to go false only when
 * `lastAssessmentId` names an assessment this very batch creates — a request can't be dismissed
 * without answering it.
 */
export async function submitAssessment(
  db: Firestore,
  studentId: string,
  trainerId: string,
  answers: Readonly<Record<string, boolean>>,
  profile: { goal: string; experienceLevel: string; trainingDays: string[] },
  now: number,
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
  });
  batch.update(doc(db, "users", studentId), { pendingAssessmentRequest: false, lastAssessmentId: id });
  await batch.commit();
  return id;
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
