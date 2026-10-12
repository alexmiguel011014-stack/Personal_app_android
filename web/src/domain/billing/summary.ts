/**
 * GOALS.md §36b (D6) — the figures every board, dashboard and `trainerStats` shows, from the same rows, so two screens
 * can never disagree about "previsto", "recebido" or "em atraso".
 */
import { localDate } from "../dates";
import { STATES_IN_BOARD_ORDER, type Mensalidade, type MensalidadeState } from "./standing";

export interface SummaryRow {
  standing: Mensalidade;
  /** The subscription's monthly price; null when the payer has no subscription. */
  monthlyCents: number | null;
  paused: boolean;
}

/** A payment that was not voided. */
export interface SummaryPayment {
  paidAt: number;
  amountCents: number;
}

export interface BillingSummary {
  counts: Record<MensalidadeState, number>;
  /** Subscriptions that are billing (not paused). */
  activePlans: number;
  /** Their monthly prices added up. */
  planCents: number;
  /** Payments made in the month, whatever the month they covered. */
  receivedCents: number;
  /** received + the price of every active subscription whose expiry falls in the month and is still unpaid. */
  expectedCents: number;
  /** One month's price for each active subscription that is late (not one per missed month). */
  overdueCents: number;
}

// Trials and first payments are not yet revenue anyone is owed; a paused or missing plan expects nothing.
const OWING: readonly MensalidadeState[] = ["em_dia", "vence_breve", "atrasado"];

export function summarize(rows: readonly SummaryRow[], payments: readonly SummaryPayment[], month: string, timeZone?: string): BillingSummary {
  const counts = Object.fromEntries(STATES_IN_BOARD_ORDER.map((state) => [state, 0])) as Record<MensalidadeState, number>;
  let activePlans = 0;
  let planCents = 0;
  let dueCents = 0;
  let overdueCents = 0;
  for (const row of rows) {
    counts[row.standing.state] += 1;
    if (row.monthlyCents === null || row.paused) continue;
    activePlans += 1;
    planCents += row.monthlyCents;
    if (OWING.includes(row.standing.state) && row.standing.expiresOn?.slice(0, 7) === month) dueCents += row.monthlyCents;
    if (row.standing.state === "atrasado") overdueCents += row.monthlyCents;
  }
  let receivedCents = 0;
  for (const payment of payments) {
    if (localDate(payment.paidAt, timeZone).slice(0, 7) === month) receivedCents += payment.amountCents;
  }
  return { counts, activePlans, planCents, receivedCents, expectedCents: receivedCents + dueCents, overdueCents };
}
