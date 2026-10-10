/**
 * GOALS.md §36b — the rules of renewal, payment, estorno and assignment, as pure functions. Both scopes (the ADM
 * billing a personal, a personal billing an aluno) run the same maths; each scope's data layer only reads and writes
 * the documents around them. Nothing here touches Firebase or the clock: every instant is an argument.
 */
import { addMonths, daysInMonth, DEFAULT_TIME_ZONE, localDate } from "../dates";
import type { BillingStatus } from "./standing";

export type BillingMode = "trial" | "paid";

/** What a payer's access/billing currently looks like — the two stored fields. */
export interface Standing {
  status: BillingStatus | null;
  until: number | null;
}

export type BillingErrorCode = "invalid_amount" | "no_standing" | "payment_too_old" | "not_latest" | "already_voided";

/** A refusal the person can act on; scopes may reword it, the `code` is what code branches on. */
export class BillingError extends Error {
  constructor(readonly code: BillingErrorCode, message: string) {
    super(message);
    this.name = "BillingError";
  }
}

const DAY_MS = 86_400_000;

// ---- calendar -----------------------------------------------------------------------------------------------

function offsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - Math.floor(at / 1000) * 1000;
}

/**
 * The last millisecond of `date` in `timeZone`. São Paulo (the default) keeps the fixed `-03:00` the platform has always
 * used — Brazil has no DST since 2019 and the Rules/e2e compare against exactly that instant — any other zone is
 * resolved through Intl.
 */
export function endOfDayDeadline(date: string, timeZone: string = DEFAULT_TIME_ZONE): number {
  if (timeZone === DEFAULT_TIME_ZONE) return Date.parse(`${date}T23:59:59.999-03:00`);
  const guess = Date.parse(`${date}T23:59:59.999Z`);
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
}

/** `day` of `yearMonth` ("YYYY-MM"), clamped to the month's last day — "dia 31" is the 28th in February. */
export function dueDateIn(yearMonth: string, day: number): string {
  return `${yearMonth}-${String(Math.min(day, daysInMonth(yearMonth))).padStart(2, "0")}`;
}

/**
 * Where a payment made at `at` takes the expiry (§35 D1, §36 D3).
 *  - `billingDay === null`: one calendar month after the current expiry day while that is still ahead — so paying
 *    during a trial counts from the trial's end — otherwise one month after the payment day (the platform).
 *  - `billingDay` 1–31: that day of the month after the same base date — the "dia do vencimento" an aluno plan keeps.
 */
export function nextPaidThrough(
  at: number,
  currentUntil: number | null,
  billingDay: number | null = null,
  timeZone: string = DEFAULT_TIME_ZONE,
): { date: string; until: number } {
  const base = currentUntil !== null && currentUntil > at ? localDate(currentUntil, timeZone) : localDate(at, timeZone);
  const date = billingDay === null ? addMonths(base, 1) : dueDateIn(addMonths(`${base.slice(0, 7)}-01`, 1).slice(0, 7), billingDay);
  return { date, until: endOfDayDeadline(date, timeZone) };
}

// ---- payment ------------------------------------------------------------------------------------------------

export interface PaymentInput {
  /** When it was paid (an earlier day than today is a backdated payment). */
  at: number;
  /** The current instant — the new expiry must be ahead of it. */
  now: number;
  billingDay: number | null;
  timeZone?: string;
  standing: Standing;
  mode: BillingMode;
  amountCents: number;
}

export interface PaymentPlan {
  previousStatus: BillingStatus;
  previousUntil: number | null;
  previousMode: BillingMode;
  newUntil: number;
  paidThroughDate: string;
  /** A trial subscription turns `paid` with its first payment. */
  modeFlips: boolean;
}

/** What recording a payment does, or a `BillingError` saying why it cannot be done. */
export function planPayment(input: PaymentInput): PaymentPlan {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) {
    throw new BillingError("invalid_amount", "Informe um valor recebido válido.");
  }
  const { status, until } = input.standing;
  if (status === null) {
    throw new BillingError("no_standing", "Ainda não há regras de cobrança aplicadas. Reatribua o plano antes de registrar o pagamento.");
  }
  // Only a running trial or a current account carries an expiry worth extending; anything else restarts from the payment day.
  const base = status === "trial" || status === "current" ? until : null;
  const next = nextPaidThrough(input.at, base, input.billingDay, input.timeZone);
  if (next.until <= input.now) {
    throw new BillingError("payment_too_old", "Esse pagamento é antigo demais: o vencimento continuaria no passado. Registre uma data mais recente.");
  }
  return {
    previousStatus: status,
    previousUntil: until,
    previousMode: input.mode,
    newUntil: next.until,
    paidThroughDate: next.date,
    modeFlips: input.mode === "trial",
  };
}

export interface VoidInput {
  payment: { newUntil: number; previousStatus: BillingStatus; previousUntil: number | null; previousMode: BillingMode; voidedAt: number | null };
  standing: Standing;
  /** The subscription's mode right now. */
  mode: BillingMode;
}

export interface VoidPlan {
  restore: { status: BillingStatus; until: number | null };
  /** `trial` when the payment had turned a trial into paid; null when the mode stays. */
  restoreMode: BillingMode | null;
}

/** Undoing the latest payment (§35 D5): only while the expiry is still the one it set, so nothing later is guessed away. */
export function planVoid(input: VoidInput): VoidPlan {
  if (input.payment.voidedAt !== null) throw new BillingError("already_voided", "Este pagamento já foi estornado.");
  if (input.standing.status !== "current" || input.standing.until !== input.payment.newUntil) {
    throw new BillingError("not_latest", "Só é possível estornar o último pagamento, enquanto o vencimento ainda for o que ele definiu.");
  }
  return {
    restore: { status: input.payment.previousStatus, until: input.payment.previousUntil },
    restoreMode: input.payment.previousMode === "trial" && input.mode === "paid" ? "trial" : null,
  };
}

// ---- assignment ---------------------------------------------------------------------------------------------

export interface AssignmentInput {
  /** The subscription before this assignment, or null for the first one. */
  previous: { mode: BillingMode; trialStartedAt: number | null; trialEndsAt: number | null } | null;
  standing: Standing;
  trialDurationDays: number;
  effectiveAt: number;
}

export interface AssignmentPlan {
  mode: BillingMode;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  nextStanding: { status: BillingStatus; until: number | null };
}

/**
 * How an assignment starts the account (§35 D2). The first assignment decides: a plan with trial days opens a free
 * trial, one without leaves the account `pending` until the first payment. A later assignment only swaps the terms —
 * status and expiry are untouched and an account never gets a second trial (unless it never trialed and never paid).
 */
export function planAssignment(input: AssignmentInput): AssignmentPlan {
  const { previous, standing, trialDurationDays, effectiveAt } = input;
  const startsTrial = trialDurationDays > 0 && (previous === null || (previous.trialStartedAt === null && standing.status === "pending"));
  if (startsTrial) {
    const trialEndsAt = effectiveAt + trialDurationDays * DAY_MS;
    if (!Number.isSafeInteger(trialEndsAt)) throw new Error("A duração do teste ultrapassa o limite permitido.");
    return { mode: "trial", trialStartedAt: effectiveAt, trialEndsAt, nextStanding: { status: "trial", until: trialEndsAt } };
  }
  if (previous === null) {
    return { mode: "paid", trialStartedAt: null, trialEndsAt: null, nextStanding: { status: "pending", until: null } };
  }
  return {
    mode: previous.mode,
    trialStartedAt: previous.trialStartedAt,
    trialEndsAt: previous.trialEndsAt,
    nextStanding: { status: standing.status ?? "pending", until: standing.until },
  };
}
