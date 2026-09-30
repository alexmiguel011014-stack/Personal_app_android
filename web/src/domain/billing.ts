import { isCalendarDate } from "./dates";
import { isKotlinBlank, toIntOrNull } from "./kotlin";
import { isValidAmountCents, parseAmountCents, type BillingPlan, type Payment, type PaymentMethod, type PaymentStatus } from "./payments";
import type { Student } from "./students";

// GOALS.md §23g: managing mensalidades — whose billing is whose, and the trainer's inputs.
//
// A plan, and every charge generated from it, is keyed by the id of the student it was registered
// for. When a draft later claims an invite, the person gets a new id (their account's uid) and the
// plan stays on the draft's. Unlike fichas, that's harmless here — billing is web-only and doesn't
// depend on the student using the app, so plans are allowed for drafts too — as long as the web
// maps the old id to the account: the account's page then finds its plan and never offers a second.

export interface BillingOwner {
  /** The student's page id. */
  id: string;
  name: string;
}

/** Billing id → the student it belongs to: their own id, plus the draft an account claimed. */
export function billingOwners(
  students: readonly Student[],
  claimedDraftByAccount: ReadonlyMap<string, string>,
): Map<string, BillingOwner> {
  const owners = new Map<string, BillingOwner>();
  for (const student of students) {
    const owner = { id: student.id, name: student.name };
    owners.set(student.id, owner);
    const draftId = claimedDraftByAccount.get(student.id);
    if (draftId !== undefined) owners.set(draftId, owner);
  }
  return owners;
}

/** A student's plans — normally one; two only if one was made on each id before this mapping existed. */
export function plansOf(
  studentId: string,
  plans: readonly BillingPlan[],
  owners: ReadonlyMap<string, BillingOwner>,
): BillingPlan[] {
  return plans.filter((plan) => owners.get(plan.studentId)?.id === studentId);
}

/** A student's charges, newest first. */
export function chargesOf(
  studentId: string,
  payments: readonly Payment[],
  owners: ReadonlyMap<string, BillingOwner>,
): Payment[] {
  return payments
    .filter((payment) => owners.get(payment.studentId)?.id === studentId)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência",
  other: "Outro",
};

export const STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Pago",
  pending: "A vencer",
  overdue: "Em atraso",
};

const AMOUNT_ERROR = "Informe o valor em reais, por exemplo 150,00.";

function parseAmount(text: string): number | null {
  const cents = parseAmountCents(text);
  return cents !== null && isValidAmountCents(cents) ? cents : null;
}

/** The plan form: an amount in reais and a due day from 1 to 31. */
export function parsePlanInput(amountText: string, dueDayText: string): { amountCents: number; dueDay: number } | { error: string } {
  const amountCents = parseAmount(amountText);
  if (amountCents === null) return { error: AMOUNT_ERROR };
  const dueDay = isKotlinBlank(dueDayText) ? null : toIntOrNull(dueDayText.trim());
  if (dueDay === null || dueDay < 1 || dueDay > 31) return { error: "O dia do vencimento vai de 1 a 31." };
  return { amountCents, dueDay };
}

/**
 * When a charge was paid, from the day the trainer picks. Today means now. An earlier day becomes
 * 12:00 UTC of that day, which is still that calendar day anywhere from UTC−11 to UTC+11 — so the
 * payment counts in the month the trainer chose, by their own calendar, without a time-zone table.
 */
export function paidAtFor(date: string, today: string, now: number): { paidAt: number } | { error: string } {
  if (!isCalendarDate(date)) return { error: "Informe a data do pagamento." };
  if (date > today) return { error: "A data do pagamento não pode ser no futuro." };
  return { paidAt: date === today ? now : Date.parse(`${date}T12:00:00Z`) };
}

/**
 * Adjusting an unpaid charge: its amount, and its due date within the same month — firestore.rules
 * only allow that, since the charge's id carries its month.
 */
export function parseAdjustment(
  charge: Pick<Payment, "dueDate">,
  amountText: string,
  dueDate: string,
): { amountCents: number; dueDate: string } | { error: string } {
  const amountCents = parseAmount(amountText);
  if (amountCents === null) return { error: AMOUNT_ERROR };
  if (!isCalendarDate(dueDate)) return { error: "Informe o vencimento." };
  if (dueDate.slice(0, 7) !== charge.dueDate.slice(0, 7)) {
    return { error: "O vencimento precisa continuar no mesmo mês da cobrança." };
  }
  return { amountCents, dueDate };
}
