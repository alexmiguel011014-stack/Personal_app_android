import { addDays, daysInMonth, localDate } from "./dates";

// GOALS.md §23c — mensalidades, level 1: the trainer records charges and marks them paid by hand.
// Nothing here moves money. Two Firestore collections, both trainer-only (§23d):
//
//   payments/{studentId}_{YYYY-MM}   one charge per student per month
//   billingPlans/{studentId}         what to charge that student every month
//
// Why the plan is its own collection instead of fields on the student's users/{uid} document:
// Firestore rules are per document, not per field. A linked student can read their own users doc,
// so anything stored there is visible to them — and the trainer decided on 2026-09-22 that a
// student does not see their own billing. Keeping it out of every document they can read is the
// only way to enforce that.

export type Currency = "BRL";

/**
 * Which system owns the charge's lifecycle. Level 1 only ever writes "manual".
 *
 * This field plus `externalId` is the gate the trainer asked for: when real charging (level 2)
 * arrives, a gateway webhook writes this same document shape with source "gateway" — a new writer,
 * not a new model, and every query and function here keeps working untouched.
 */
export type PaymentSource = "manual" | "gateway";

export type PaymentMethod = "pix" | "cash" | "card" | "transfer" | "other";

export type PaymentStatus = "paid" | "overdue" | "pending";

/** Firestore `payments/{id}`. No optional fields: absent always means an explicit null. */
export interface Payment {
  id: string;
  trainerId: string;
  studentId: string;
  /** Integer cents. Money is never a float anywhere in this app. */
  amountCents: number;
  currency: Currency;
  /** A calendar date, "YYYY-MM-DD" — a due date is a day, not an instant. */
  dueDate: string;
  /**
   * Epoch ms, or null while unpaid — and always written, never left out. Firestore's
   * `where("paidAt", "==", null)` only matches documents where the field exists and is null, so a
   * charge saved without the field silently disappears from every "unpaid" query.
   */
  paidAt: number | null;
  method: PaymentMethod | null;
  source: PaymentSource;
  /** The gateway's id for this charge; null for manual ones. */
  externalId: string | null;
  note: string | null;
  createdAt: number;
}

/** Firestore `billingPlans/{studentId}`: one plan per student. */
export interface BillingPlan {
  studentId: string;
  trainerId: string;
  amountCents: number;
  currency: Currency;
  /** 1–31, clamped to the month's last day — "dia 31" means the 28th in February. */
  dueDay: number;
  /** false stops new monthly charges without touching the history. */
  active: boolean;
  createdAt: number;
}

/**
 * Deterministic on purpose: generating "this month's charges" twice — two open tabs, a reload in
 * the middle of a write — lands on the same documents instead of duplicating them. Writers must
 * still create only if absent (never a blind set), or regenerating would wipe a recorded paidAt.
 */
export function paymentId(studentId: string, yearMonth: string): string {
  return `${studentId}_${yearMonth}`;
}

export function dueDateFor(yearMonth: string, dueDay: number): string {
  const day = Math.min(dueDay, daysInMonth(yearMonth));
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

export function isValidAmountCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/** A plan's charge for one month: unpaid, manual, every nullable field explicitly null. */
export function monthlyCharge(plan: BillingPlan, yearMonth: string, now: number): Payment {
  if (!isValidAmountCents(plan.amountCents)) {
    throw new Error(`amountCents must be a positive integer, got ${plan.amountCents}`);
  }
  if (!Number.isInteger(plan.dueDay) || plan.dueDay < 1 || plan.dueDay > 31) {
    throw new Error(`dueDay must be an integer from 1 to 31, got ${plan.dueDay}`);
  }
  return {
    id: paymentId(plan.studentId, yearMonth),
    trainerId: plan.trainerId,
    studentId: plan.studentId,
    amountCents: plan.amountCents,
    currency: plan.currency,
    dueDate: dueDateFor(yearMonth, plan.dueDay),
    paidAt: null,
    method: null,
    source: "manual",
    externalId: null,
    note: null,
    createdAt: now,
  };
}

/**
 * The first month a plan charges for: the month it was registered in if that month's due date was
 * still ahead (or that very day), otherwise the next one. Without this, a plan registered on the
 * 28th with due day 10 would produce a charge that is overdue the moment it exists.
 */
export function firstBillableMonth(plan: Pick<BillingPlan, "createdAt" | "dueDay">, timeZone: string): string {
  const created = localDate(plan.createdAt, timeZone);
  const month = created.slice(0, 7);
  if (dueDateFor(month, plan.dueDay) >= created) return month;
  return addDays(`${month}-${String(daysInMonth(month)).padStart(2, "0")}`, 1).slice(0, 7);
}

/** Active plans already billing by `yearMonth` (firstBillableMonth) with no charge for it yet. */
export function plansMissingCharge(
  plans: readonly BillingPlan[],
  payments: readonly Pick<Payment, "id">[],
  yearMonth: string,
  timeZone: string,
): BillingPlan[] {
  const existing = new Set(payments.map((payment) => payment.id));
  return plans.filter(
    (plan) =>
      plan.active &&
      yearMonth >= firstBillableMonth(plan, timeZone) &&
      !existing.has(paymentId(plan.studentId, yearMonth)),
  );
}

/**
 * A month's money: what falls due in it, and what was received in it — by the trainer's calendar,
 * so a Pix at 23:00 on the 31st counts in that month even though it's already the 1st in UTC.
 */
export function monthTotals(
  payments: readonly Payment[],
  yearMonth: string,
  timeZone: string,
): { expectedCents: number; receivedCents: number } {
  let expectedCents = 0;
  let receivedCents = 0;
  for (const payment of payments) {
    if (payment.dueDate.slice(0, 7) === yearMonth) expectedCents += payment.amountCents;
    if (payment.paidAt !== null && localDate(payment.paidAt, timeZone).slice(0, 7) === yearMonth) {
      receivedCents += payment.amountCents;
    }
  }
  return { expectedCents, receivedCents };
}

/** Derived, never stored: a stored status drifts away from paidAt the first time a write half-fails. */
export function paymentStatus(payment: Pick<Payment, "paidAt" | "dueDate">, today: string): PaymentStatus {
  if (payment.paidAt !== null) return "paid";
  // Due today is not late yet.
  return payment.dueDate < today ? "overdue" : "pending";
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Integer cents as "R$ 150,10". The amount goes to Intl as an exact decimal string, never as
 * cents / 100 — keeping "money is never a float" true even on the way to the screen.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const exact = `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return BRL.format(exact as `${number}`);
}

/**
 * What the trainer types ("150", "150,5", "1.234,56", "R$ 90,00") as integer cents, without ever
 * touching a float — "150,10" parsed as 150.1 and multiplied by 100 is 15009.999…, which is exactly
 * the bug this exists to prevent. pt-BR only: "," separates decimals and "." only groups thousands,
 * so an ambiguous "150.50" is rejected rather than guessed. Null when unparseable; zero parses
 * (validity is isValidAmountCents' job, not the parser's).
 */
export function parseAmountCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/, "");
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const reais = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}
