import { FirebaseError } from "firebase/app";
import { doc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import type { StudentProfile } from "../domain/studentProfile";
import type { DraftStudentDoc, LinkedStudentDoc } from "../domain/students";

// GOALS.md §23g: the trainer's writes to a student — ports of TrainerViewModel.addStudent and
// SqlDelightTrainerRepository's insertUser / updateUser / setStudentPermission /
// requestAssessment / generateInvite: the same documents and fields the phone writes.
//
// Left out on purpose: addStudent's optional first measurement. A draft's measurement stays on the
// draft's id and the student never sees it once they connect, so on the web measurements are
// recorded after the claim, from the student's page (§23g, part 4).

export type TrainerStudent = { kind: "draft"; doc: DraftStudentDoc } | { kind: "linked"; doc: LinkedStudentDoc };

/** `students/{id}` — FirestoreMappers' `UserEntity.toFirestoreMap(trainerId)`. */
export function draftToFirestore(
  trainerId: string,
  profile: StudentProfile,
  createdAt: number,
): Record<string, unknown> {
  return {
    trainerId,
    name: profile.name,
    role: "student",
    gender: profile.gender,
    phone: profile.phone,
    goal: profile.goal,
    experienceLevel: profile.experienceLevel,
    medicalNotes: profile.medicalNotes,
    trainingDays: profile.trainingDays,
    createdAt,
  };
}

/** `toLinkedStudentUpdateMap()` — exactly the fields the rules let a trainer write on users/{uid}. */
export function linkedProfileUpdate(profile: StudentProfile): Record<string, unknown> {
  return {
    name: profile.name,
    gender: profile.gender,
    phone: profile.phone,
    goal: profile.goal,
    experienceLevel: profile.experienceLevel,
    medicalNotes: profile.medicalNotes,
    trainingDays: profile.trainingDays,
  };
}

/** TrainerViewModel.addStudent: a random UUID id, like `Uuid.random().toString()`. */
export async function createDraftStudent(
  db: Firestore,
  trainerId: string,
  profile: StudentProfile,
  now: number,
): Promise<string> {
  const id = crypto.randomUUID();
  await setDoc(doc(db, "students", id), draftToFirestore(trainerId, profile, now));
  return id;
}

/** updateUser: a draft is rewritten whole (keeping its createdAt); an account gets a merge. */
export async function updateStudentProfile(
  db: Firestore,
  trainerId: string,
  student: TrainerStudent,
  profile: StudentProfile,
): Promise<void> {
  if (student.kind === "draft") {
    await setDoc(doc(db, "students", student.doc.id), draftToFirestore(trainerId, profile, student.doc.createdAt));
  } else {
    await setDoc(doc(db, "users", student.doc.id), linkedProfileUpdate(profile), { merge: true });
  }
}

/** GOALS.md §17's trainer-granted permissions, on a connected student's own document. */
export async function setStudentPermissions(
  db: Firestore,
  studentId: string,
  canSelfAssess: boolean,
  canLogBiometrics: boolean,
): Promise<void> {
  await setDoc(doc(db, "users", studentId), { canSelfAssess, canLogBiometrics }, { merge: true });
}

/**
 * Whether a connected student may add extra sets when logging a session. Its own function, writing
 * only this field with merge, so granting it can never touch the two §17 permissions beside it.
 * firestore.rules let only the owning trainer write it — a student can't switch it on for themselves.
 */
export async function setCanAddSets(db: Firestore, studentId: string, canAddSets: boolean): Promise<void> {
  await setDoc(doc(db, "users", studentId), { canAddSets }, { merge: true });
}

export async function requestAssessment(db: Firestore, studentId: string): Promise<void> {
  await updateDoc(doc(db, "users", studentId), { pendingAssessmentRequest: true });
}

/** generateInvite's code: 8 uppercase hex characters of a random UUID. */
export function newInviteCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/**
 * `invites/{code}` for a draft, carrying its profile (claimInvite copies it onto the new account).
 * An existing code can't be overwritten — the rules only allow creating an unused invite or marking
 * one used — so a collision comes back as permission-denied and simply gets a fresh code.
 */
export async function generateInvite(
  db: Firestore,
  trainerId: string,
  draft: DraftStudentDoc,
  now: number,
  nextCode: () => string = newInviteCode,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = nextCode();
    try {
      await setDoc(doc(db, "invites", code), {
        trainerId,
        used: false,
        createdAt: now,
        draftId: draft.id,
        name: draft.name,
        phone: draft.phone,
        gender: draft.gender,
        goal: draft.goal,
        experienceLevel: draft.experienceLevel,
        medicalNotes: draft.medicalNotes,
        trainingDays: draft.trainingDays,
      });
      return code;
    } catch (error) {
      if (!(error instanceof FirebaseError && error.code === "permission-denied")) throw error;
    }
  }
  throw new Error("Não foi possível gerar um código de convite. Tente de novo.");
}
