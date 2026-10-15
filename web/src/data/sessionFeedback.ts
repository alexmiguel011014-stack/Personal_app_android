import { collection, doc, query, serverTimestamp, setDoc, where, type Firestore, type QuerySnapshot } from "firebase/firestore";
import { getDocs } from "./firestoreRead";
import { sessionFeedbackId, type SessionFeedback } from "../domain/sessionFeedback";
import { toSessionFeedback } from "./converters";

// GOALS.md §38h: how a session went. One document per aluno × local day, two writers that each touch only their own
// fields (firestore.rules v8): a `set(..., { merge: true })` with explicit fields, never a rewrite of a parsed document.
// Every `*At` is the server's time — the Rules refuse a device clock.

function identity(studentId: string, trainerId: string, day: string) {
  return { studentId, trainerId, day };
}

/** The aluno's side: effort (or null), pain and a comment. Saving again replaces what they said before. */
export async function saveMyFeedback(
  db: Firestore,
  studentId: string,
  trainerId: string,
  day: string,
  input: { effort: number | null; pain: boolean; comment: string },
): Promise<void> {
  await setDoc(
    doc(db, "sessionFeedback", sessionFeedbackId(studentId, day)),
    { ...identity(studentId, trainerId, day), effort: input.effort, pain: input.pain, studentComment: input.comment, studentAt: serverTimestamp() },
    { merge: true },
  );
}

/** The aluno opened the personal's comment. */
export async function markTrainerCommentSeen(db: Firestore, studentId: string, trainerId: string, day: string): Promise<void> {
  await setDoc(
    doc(db, "sessionFeedback", sessionFeedbackId(studentId, day)),
    { ...identity(studentId, trainerId, day), studentSeenAt: serverTimestamp() },
    { merge: true },
  );
}

/** The personal's side: "seen" and/or a comment (a blank comment is not written). */
export async function saveTrainerResponse(
  db: Firestore,
  trainerId: string,
  studentId: string,
  day: string,
  response: { seen?: boolean; comment?: string },
): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (response.seen) fields.trainerSeenAt = serverTimestamp();
  if (response.comment !== undefined && response.comment !== "") {
    fields.trainerComment = response.comment;
    fields.trainerAt = serverTimestamp();
  }
  if (Object.keys(fields).length === 0) return;
  await setDoc(doc(db, "sessionFeedback", sessionFeedbackId(studentId, day)), { ...identity(studentId, trainerId, day), ...fields }, { merge: true });
}

function convert(snapshot: QuerySnapshot): SessionFeedback[] {
  return snapshot.docs.map((document) => toSessionFeedback(document.id, document.data())).filter((item) => item !== null);
}

/**
 * The personal's alunos' feedback for sessions on [fromDay, toDay) (local days, `YYYY-MM-DD`; strings sort as dates).
 * Windowed like every trainer query (§38b); needs the (trainerId, day) index. Cost: one document per session with feedback.
 */
export async function loadTrainerFeedback(db: Firestore, trainerId: string, fromDay: string, toDay?: string): Promise<SessionFeedback[]> {
  const range = [where("day", ">=", fromDay), ...(toDay === undefined ? [] : [where("day", "<", toDay)])];
  return convert(await getDocs(query(collection(db, "sessionFeedback"), where("trainerId", "==", trainerId), ...range)));
}

/** The aluno's own feedback from `fromDay` on; needs the (studentId, day) index. */
export async function loadMyFeedback(db: Firestore, studentId: string, fromDay: string): Promise<SessionFeedback[]> {
  return convert(await getDocs(query(collection(db, "sessionFeedback"), where("studentId", "==", studentId), where("day", ">=", fromDay))));
}

/** One aluno's feedback from `fromDay` on, for the personal's page about them; needs the (trainerId, studentId, day) index. */
export async function loadStudentFeedback(db: Firestore, trainerId: string, studentId: string, fromDay: string): Promise<SessionFeedback[]> {
  return convert(
    await getDocs(
      query(collection(db, "sessionFeedback"), where("trainerId", "==", trainerId), where("studentId", "==", studentId), where("day", ">=", fromDay)),
    ),
  );
}
