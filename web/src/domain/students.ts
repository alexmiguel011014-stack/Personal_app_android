// GOALS.md §23c: a trainer's students live in two Firestore collections. Shapes mirror
// FirestoreMappers.kt exactly — the Kotlin side is the reference, and any disagreement is a bug
// here, not there.
//
//   students/{id}  a draft the trainer registered; the person has no account yet. role "student".
//   users/{uid}    a real account that claimed the trainer's invite. role "STUDENT" — uppercase is
//                  AuthRepository's convention, deliberately different from the draft's.
//
// Claiming an invite does NOT delete or mark the draft (AuthRepository.claimInvite), so after a
// claim the same person exists in both collections. Found 2026-09-22: the Kotlin app concatenates
// the two lists with no dedup (FirestoreTrainerRepository.getStudents; SqlDelightTrainerRepository
// mirrors both into one table under different ids), so that student shows up twice. The only link
// between the two documents is two hops away —
//   users/{uid}.inviteCode → invites/{code}.draftId → students/{draftId}
// — so the caller supplies that map, built from the invites the trainer owns, and mergeStudents
// drops every draft that has been claimed.

/** Firestore `students/{id}`. */
export interface DraftStudentDoc {
  id: string;
  trainerId: string;
  name: string;
  role: string;
  gender: string;
  phone: string;
  goal: string;
  experienceLevel: string;
  medicalNotes: string;
  trainingDays: string[];
  createdAt: number;
  /** Optional in Firestore for legacy documents; converters normalize absence to false. */
  paused: boolean;
}

/** Firestore `users/{uid}` for a linked student (role "STUDENT"). */
export interface LinkedStudentDoc {
  /** The account's auth uid. */
  id: string;
  trainerId: string;
  role: string;
  /** Written by claimInvite; null on accounts that didn't come through an invite. */
  inviteCode: string | null;
  name: string;
  gender: string;
  phone: string;
  goal: string;
  experienceLevel: string;
  medicalNotes: string;
  trainingDays: string[];
  /** When the invite was claimed. */
  createdAt: number;
  canSelfAssess: boolean;
  canLogBiometrics: boolean;
  /**
   * Web-only, same rule as the two above: the student may add extra sets when logging a session.
   * Off unless the trainer turns it on; a document without the field (every one the phone writes)
   * reads as off.
   */
  canAddSets: boolean;
  pendingAssessmentRequest: boolean;
  /** Optional in Firestore for legacy documents; converters normalize absence to false. */
  paused: boolean;
}

/** One row of the trainer's student list, whichever collection it came from. */
export interface Student {
  id: string;
  name: string;
  linked: boolean;
  goal: string;
  /** Non-empty means the Android list shows its warning icon. */
  medicalNotes: string;
  trainingDays: string[];
  /** Linked: when the invite was claimed. Draft: when the trainer registered them. */
  createdAt: number;
  pendingAssessmentRequest: boolean;
  paused: boolean;
}

export type StudentPauseFilter = "active" | "paused" | "all";

export function filterStudentsByPause(students: readonly Student[], filter: StudentPauseFilter = "active"): Student[] {
  return filter === "all" ? [...students] : students.filter((student) => student.paused === (filter === "paused"));
}

/**
 * Case- and accent-insensitive name search: "joao" finds "João", "ANA" finds "Ana Costa". Names are
 * typed on a phone keyboard and searched on a desktop one, and the two rarely agree on accents.
 */
export function matchesSearch(name: string, query: string): boolean {
  const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  return fold(name).includes(fold(query));
}

/** Account uid → the draft its invite was minted from, for every account that claimed one. */
export function claimedDrafts(
  linked: readonly LinkedStudentDoc[],
  draftIdByInviteCode: ReadonlyMap<string, string>,
): Map<string, string> {
  const claimed = new Map<string, string>();
  for (const account of linked) {
    if (account.inviteCode === null) continue;
    const draftId = draftIdByInviteCode.get(account.inviteCode);
    if (draftId !== undefined) claimed.set(account.id, draftId);
  }
  return claimed;
}

export function mergeStudents(
  drafts: readonly DraftStudentDoc[],
  linked: readonly LinkedStudentDoc[],
  draftIdByInviteCode: ReadonlyMap<string, string>,
): Student[] {
  const claimedDraftIds = new Set(claimedDrafts(linked, draftIdByInviteCode).values());

  const unclaimedDrafts: Student[] = drafts
    .filter((draft) => !claimedDraftIds.has(draft.id))
    .map((draft) => ({
      id: draft.id,
      name: draft.name,
      linked: false,
      goal: draft.goal,
      medicalNotes: draft.medicalNotes,
      trainingDays: draft.trainingDays,
      createdAt: draft.createdAt,
      pendingAssessmentRequest: false,
      paused: draft.paused,
    }));
  const accounts: Student[] = linked.map((account) => ({
    id: account.id,
    name: account.name,
    linked: true,
    goal: account.goal,
    medicalNotes: account.medicalNotes,
    trainingDays: account.trainingDays,
    createdAt: account.createdAt,
    pendingAssessmentRequest: account.pendingAssessmentRequest,
    paused: account.paused,
  }));
  return [...unclaimedDrafts, ...accounts];
}
