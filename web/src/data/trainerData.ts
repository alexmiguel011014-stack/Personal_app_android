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
import { monthlyCharge, type BillingPlan, type Payment } from "../domain/payments";
import { mergeStudents, type LinkedStudentDoc, type Student } from "../domain/students";
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
  students: Student[];
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
  const linkedStudents = mapDocs(linked, toLinkedStudent);
  return {
    students: mergeStudents(
      mapDocs(drafts, toDraftStudent),
      linkedStudents,
      await draftIdsForInvites(db, linkedStudents),
    ),
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
