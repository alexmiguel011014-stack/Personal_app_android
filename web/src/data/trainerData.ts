import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import { getDoc, getDocs, noteReads } from "./firestoreRead";
import { loadTrainerFeedback } from "./sessionFeedback";
import { localDate } from "../domain/dates";
import type { SessionFeedback } from "../domain/sessionFeedback";
import type { WorkoutLogDoc } from "../domain/metrics";
import { monthlyCharge, plansMissingCharge, type BillingPlan, type Payment } from "../domain/payments";
import {
  FEEDBACK_ATTENTION_DAYS,
  TRAINER_LOG_WINDOW_DAYS,
  mergeLogWindow,
  refreshStart,
  studentsNeedingEarlierLog,
  windowStart,
} from "../domain/readWindows";
import {
  claimedDrafts,
  mergeStudents,
  type DraftStudentDoc,
  type LinkedStudentDoc,
  type Student,
} from "../domain/students";
import {
  paymentToFirestore,
  toBillingPlan,
  toDraftStudent,
  toLinkedStudent,
  toPayment,
  toWorkoutLog,
} from "./converters";

// GOALS.md §23e: what the trainer dashboard reads, handed to the pure functions in ../domain.
//
// GOALS.md §38b: on the Spark plan every document read is billed against 50,000 a day for the whole project, and
// workoutLogs grow by one document per exercise per session — a year of a 20-aluno personal is ≈ 18,700 of them,
// which the old "every log, all time" load read on every trainer page (and, on the emulators, took so long that the
// SDK gave up and the pages showed an empty roster). Now the logs are a window (domain/readWindows.ts) plus each
// quiet aluno's latest older log, and a refresh re-reads only the recent overlap. The window queries need the
// composite indexes in firestore.indexes.json, deployed by the owner.

export interface TrainerSnapshot {
  /** Drafts and accounts merged, claimed drafts dropped — the list and the dashboard's view. */
  students: Student[];
  /** The full documents behind `students`, for the detail page and its writes. */
  drafts: DraftStudentDoc[];
  linked: LinkedStudentDoc[];
  /** Account uid → the draft it claimed: billing registered on the draft still belongs to them. */
  claimedDraftByAccount: Map<string, string>;
  /** The trainer's workoutLogs dated from `logsFrom` on — the last TRAINER_LOG_WINDOW_DAYS days, not all time. */
  logs: WorkoutLogDoc[];
  /** Each linked aluno's latest log before the window, when they have none inside it (dashboardFigures' quiet list). */
  earlierLogs: WorkoutLogDoc[];
  /** Epoch ms: where `logs` starts. Older history is read on request (loadStudentLogs, loadTrainerLogs). */
  logsFrom: number;
  /** Epoch ms of this load — where the next refresh's overlap is measured from. */
  loadedAt: number;
  /** Kept between refreshes so they are not read again: invite code → draft id, and aluno → latest older log. */
  draftIdByInvite: Map<string, string>;
  earlierByStudent: Map<string, WorkoutLogDoc | null>;
  payments: Payment[];
  plans: BillingPlan[];
  /** GOALS.md §38h: the alunos' feedback on the last FEEDBACK_ATTENTION_DAYS days — what "Hoje" flags (pain first); Registros reads its own window. */
  feedback: SessionFeedback[];
}

function mapDocs<T>(snapshot: QuerySnapshot, convert: (id: string, data: Record<string, unknown>) => T | null): T[] {
  const items: T[] = [];
  for (const document of snapshot.docs) {
    const item = convert(document.id, document.data());
    if (item !== null) items.push(item);
  }
  return items;
}

/**
 * The trainer's data. With `previous` (a snapshot loaded earlier in the same session) only the logs of the last
 * REFRESH_OVERLAP_DAYS are read again and laid over the cached window; students, payments and plans are small and
 * always re-read whole, so a write anywhere shows up after a refresh.
 *
 * Payments stay all-time on purpose: about one document per aluno per month, and "Em atraso (todos os meses)"
 * needs every unpaid one — §36 replaces this model with a ledger anyway.
 */
export async function loadTrainerSnapshot(
  db: Firestore,
  trainerId: string,
  now: number,
  previous?: TrainerSnapshot,
): Promise<TrainerSnapshot> {
  const byTrainer = (name: string) => query(collection(db, name), where("trainerId", "==", trainerId));
  const from = windowStart(now, TRAINER_LOG_WINDOW_DAYS);
  const readFrom = previous ? refreshStart(previous.loadedAt, now, from) : from;
  const [drafts, linked, logs, payments, plans] = await Promise.all([
    getDocs(byTrainer("students")),
    getDocs(query(collection(db, "users"), where("trainerId", "==", trainerId), where("role", "==", "STUDENT"))),
    getDocs(query(collection(db, "workoutLogs"), where("trainerId", "==", trainerId), where("date", ">=", readFrom))),
    getDocs(byTrainer("payments")),
    getDocs(byTrainer("billingPlans")),
  ]);
  // An extra: the Rules that carry it may not be published yet, and "Hoje" must open without it.
  const feedback = await loadTrainerFeedback(db, trainerId, localDate(windowStart(now, FEEDBACK_ATTENTION_DAYS))).catch(() => []);
  const draftStudents = mapDocs(drafts, toDraftStudent);
  const linkedStudents = mapDocs(linked, toLinkedStudent);
  const draftIdByInvite = await draftIdsForInvites(db, linkedStudents, previous?.draftIdByInvite);
  const students = mergeStudents(draftStudents, linkedStudents, draftIdByInvite);
  const read = mapDocs(logs, toWorkoutLog);
  const windowLogs = previous ? mergeLogWindow(previous.logs, read, readFrom, from) : read;
  const needEarlier = studentsNeedingEarlierLog(students, windowLogs, from);
  const earlierByStudent = await loadEarlierLogs(db, trainerId, needEarlier, previous?.earlierByStudent);
  return {
    students,
    drafts: draftStudents,
    linked: linkedStudents,
    claimedDraftByAccount: claimedDrafts(linkedStudents, draftIdByInvite),
    logs: windowLogs,
    earlierLogs: needEarlier.map((id) => earlierByStudent.get(id) ?? null).filter((log) => log !== null),
    logsFrom: from,
    loadedAt: now,
    draftIdByInvite,
    earlierByStudent,
    payments: mapDocs(payments, toPayment),
    plans: mapDocs(plans, toBillingPlan),
    feedback,
  };
}

/**
 * Each listed aluno's latest log (they have none in the window, so it is older), one `limit(1)` query apiece —
 * known answers are reused. Needs the (trainerId, studentId, date desc) index.
 */
async function loadEarlierLogs(
  db: Firestore,
  trainerId: string,
  studentIds: readonly string[],
  known: ReadonlyMap<string, WorkoutLogDoc | null> = new Map(),
): Promise<Map<string, WorkoutLogDoc | null>> {
  const result = new Map(known);
  await Promise.all(
    studentIds
      .filter((id) => !result.has(id))
      .map(async (studentId) => {
        const snapshot = await getDocs(
          query(
            collection(db, "workoutLogs"),
            where("trainerId", "==", trainerId),
            where("studentId", "==", studentId),
            orderBy("date", "desc"),
            limit(1),
          ),
        );
        result.set(studentId, mapDocs(snapshot, toWorkoutLog)[0] ?? null);
      }),
  );
  return result;
}

/** One aluno's whole training history — read only when the personal asks for it (two equality filters, no index). */
export async function loadStudentLogs(db: Firestore, trainerId: string, studentId: string): Promise<WorkoutLogDoc[]> {
  const snapshot = await getDocs(
    query(collection(db, "workoutLogs"), where("trainerId", "==", trainerId), where("studentId", "==", studentId)),
  );
  return mapDocs(snapshot, toWorkoutLog);
}

/** The trainer's logs dated in [from, to) — "Registros" going back in time, a window at a time. */
export async function loadTrainerLogs(db: Firestore, trainerId: string, from: number, to: number): Promise<WorkoutLogDoc[]> {
  const snapshot = await getDocs(
    query(collection(db, "workoutLogs"), where("trainerId", "==", trainerId), where("date", ">=", from), where("date", "<", to)),
  );
  return mapDocs(snapshot, toWorkoutLog);
}

/**
 * inviteCode → draftId, for mergeStudents to drop the drafts a claim superseded (see
 * domain/students.ts for why that link is two hops). firestore.rules forbid listing invites, so each
 * is fetched by its code; a deleted invite simply maps to nothing and its draft stays listed. Codes
 * already in `known` are not fetched again (an invite's draft never changes).
 */
export async function draftIdsForInvites(
  db: Firestore,
  linked: readonly LinkedStudentDoc[],
  known: ReadonlyMap<string, string> = new Map(),
): Promise<Map<string, string>> {
  const codes = [...new Set(linked.map((student) => student.inviteCode).filter((code) => code !== null))];
  const entries = await Promise.all(
    codes.map(async (code) => {
      const cached = known.get(code);
      if (cached !== undefined) return [code, cached] as const;
      const snapshot = await getDoc(doc(db, "invites", code));
      const draftId: unknown = snapshot.exists() ? snapshot.get("draftId") : undefined;
      return typeof draftId === "string" ? ([code, draftId] as const) : null;
    }),
  );
  return new Map(entries.filter((entry) => entry !== null));
}

/**
 * The trainer's data with this month's charges guaranteed present — what the dashboard shows.
 *
 * Reloads whenever a charge was missing, *whether or not this call created it*. Found in the
 * browser on 2026-09-24: two loads in flight at once (React's dev double-mount; in production, two
 * tabs) both read before either wrote; one created the charge, the other found it already there,
 * created nothing, and — back when the reload depended on having created something — showed a
 * snapshot without it. The data was right; the screen was stale.
 */
export async function loadTrainerView(
  db: Firestore,
  trainerId: string,
  yearMonth: string,
  now: number,
  timeZone: string,
  previous?: TrainerSnapshot,
): Promise<{ snapshot: TrainerSnapshot; chargesCreated: number }> {
  const snapshot = await loadTrainerSnapshot(db, trainerId, now, previous);
  return ensureCharges(db, trainerId, snapshot, yearMonth, now, timeZone);
}

/** loadTrainerView's second half, for a snapshot already in hand (GOALS.md §38b: no re-read when nothing is missing). */
export async function ensureCharges(
  db: Firestore,
  trainerId: string,
  snapshot: TrainerSnapshot,
  yearMonth: string,
  now: number,
  timeZone: string,
): Promise<{ snapshot: TrainerSnapshot; chargesCreated: number }> {
  const missing = plansMissingCharge(snapshot.plans, snapshot.payments, yearMonth, timeZone);
  if (missing.length === 0) return { snapshot, chargesCreated: 0 };
  const chargesCreated = await ensureMonthlyCharges(db, missing, yearMonth, now);
  return { snapshot: await loadTrainerSnapshot(db, trainerId, now, snapshot), chargesCreated };
}

/**
 * Creates this month's charge for every active plan that doesn't have one yet; returns how many it
 * created. Create-if-absent inside a transaction, never a blind set: re-running it (two tabs, a
 * reload) must not wipe a charge that has been marked paid in the meantime.
 */
export async function ensureMonthlyCharges(
  db: Firestore,
  plans: readonly BillingPlan[],
  yearMonth: string,
  now: number,
): Promise<number> {
  let created = 0;
  for (const plan of plans) {
    if (!plan.active) continue;
    const charge = monthlyCharge(plan, yearMonth, now);
    const ref = doc(db, "payments", charge.id);
    const didCreate = await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(ref);
      noteReads("payments", 1);
      if (existing.exists()) return false;
      transaction.set(ref, paymentToFirestore(charge));
      return true;
    });
    if (didCreate) created++;
  }
  return created;
}
