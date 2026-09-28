import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import type { WorkoutLogDoc } from "../domain/metrics";
import { monthlyCharge, plansMissingCharge, type BillingPlan, type Payment } from "../domain/payments";
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

// GOALS.md §23e: what the trainer dashboard reads, loaded through the same queries the Kotlin app
// runs (so no new composite index is needed), handed to the pure functions in ../domain.

export interface TrainerSnapshot {
  /** Drafts and accounts merged, claimed drafts dropped — the list and the dashboard's view. */
  students: Student[];
  /** The full documents behind `students`, for the detail page and its writes. */
  drafts: DraftStudentDoc[];
  linked: LinkedStudentDoc[];
  /** Account uid → the draft it claimed: billing registered on the draft still belongs to them. */
  claimedDraftByAccount: Map<string, string>;
  logs: WorkoutLogDoc[];
  payments: Payment[];
  plans: BillingPlan[];
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
 * Every workout log of the trainer's, all time, like the Android listener — fine at this roster
 * size. Narrowing it to a date window needs a (trainerId, date) composite index, which is a
 * console deploy: worth it once a dashboard load feels slow, not before.
 */
export async function loadTrainerSnapshot(db: Firestore, trainerId: string): Promise<TrainerSnapshot> {
  const byTrainer = (name: string) => query(collection(db, name), where("trainerId", "==", trainerId));
  const [drafts, linked, logs, payments, plans] = await Promise.all([
    getDocs(byTrainer("students")),
    getDocs(query(collection(db, "users"), where("trainerId", "==", trainerId), where("role", "==", "STUDENT"))),
    getDocs(byTrainer("workoutLogs")),
    getDocs(byTrainer("payments")),
    getDocs(byTrainer("billingPlans")),
  ]);
  const draftStudents = mapDocs(drafts, toDraftStudent);
  const linkedStudents = mapDocs(linked, toLinkedStudent);
  const draftIdByInvite = await draftIdsForInvites(db, linkedStudents);
  return {
    students: mergeStudents(draftStudents, linkedStudents, draftIdByInvite),
    drafts: draftStudents,
    linked: linkedStudents,
    claimedDraftByAccount: claimedDrafts(linkedStudents, draftIdByInvite),
    logs: mapDocs(logs, toWorkoutLog),
    payments: mapDocs(payments, toPayment),
    plans: mapDocs(plans, toBillingPlan),
  };
}

/**
 * inviteCode → draftId, for mergeStudents to drop the drafts a claim superseded (see
 * domain/students.ts for why that link is two hops). firestore.rules forbid listing invites, so each
 * is fetched by its code; a deleted invite simply maps to nothing and its draft stays listed.
 */
export async function draftIdsForInvites(
  db: Firestore,
  linked: readonly LinkedStudentDoc[],
): Promise<Map<string, string>> {
  const codes = [...new Set(linked.map((student) => student.inviteCode).filter((code) => code !== null))];
  const entries = await Promise.all(
    codes.map(async (code) => {
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
): Promise<{ snapshot: TrainerSnapshot; chargesCreated: number }> {
  const snapshot = await loadTrainerSnapshot(db, trainerId);
  const missing = plansMissingCharge(snapshot.plans, snapshot.payments, yearMonth, timeZone);
  if (missing.length === 0) return { snapshot, chargesCreated: 0 };
  const chargesCreated = await ensureMonthlyCharges(db, missing, yearMonth, now);
  return { snapshot: await loadTrainerSnapshot(db, trainerId), chargesCreated };
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
      if ((await transaction.get(ref)).exists()) return false;
      transaction.set(ref, paymentToFirestore(charge));
      return true;
    });
    if (didCreate) created++;
  }
  return created;
}
