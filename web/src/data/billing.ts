import { doc, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import type { BillingPlan, PaymentMethod } from "../domain/payments";
import { billingPlanToFirestore } from "./converters";

// GOALS.md §23g: the trainer's writes to mensalidades. firestore.rules (§23d) decide what each may
// touch: a plan's amount, due day and on/off switch; a charge's amount, due date within its month,
// and settlement — nothing else, and never a gateway-owned charge.

/** A new plan, charging from firstBillableMonth on. A plan that already exists is refused by the rules. */
export async function createPlan(
  db: Firestore,
  trainerId: string,
  studentId: string,
  amountCents: number,
  dueDay: number,
  now: number,
): Promise<BillingPlan> {
  const plan: BillingPlan = { studentId, trainerId, amountCents, currency: "BRL", dueDay, active: true, createdAt: now };
  await setDoc(doc(db, "billingPlans", studentId), billingPlanToFirestore(plan));
  return plan;
}

/** Changes the amount and due day of charges generated from now on; past charges keep theirs. */
export async function updatePlan(db: Firestore, planId: string, amountCents: number, dueDay: number): Promise<void> {
  await updateDoc(doc(db, "billingPlans", planId), { amountCents, dueDay });
}

/** Paused plans generate no new charges; the history stays. */
export async function setPlanActive(db: Firestore, planId: string, active: boolean): Promise<void> {
  await updateDoc(doc(db, "billingPlans", planId), { active });
}

export async function markPaid(
  db: Firestore,
  paymentId: string,
  paidAt: number,
  method: PaymentMethod,
  note: string | null,
): Promise<void> {
  await updateDoc(doc(db, "payments", paymentId), { paidAt, method, note });
}

/** Undoes a mistaken "paid"; the note stays. */
export async function undoPayment(db: Firestore, paymentId: string): Promise<void> {
  await updateDoc(doc(db, "payments", paymentId), { paidAt: null, method: null });
}

export async function adjustCharge(db: Firestore, paymentId: string, amountCents: number, dueDate: string): Promise<void> {
  await updateDoc(doc(db, "payments", paymentId), { amountCents, dueDate });
}
