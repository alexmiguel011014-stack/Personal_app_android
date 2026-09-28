import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import type { Assessment } from "../domain/assessments";
import { toAssessment } from "./converters";

// GOALS.md §23g: a student's PAR-Q+ self-assessments, read by their trainer (the student writes them,
// §23h).

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
