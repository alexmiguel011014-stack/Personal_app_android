/**
 * GOALS.md §35: what the ADM sees in "Mensalidades" — where each personal stands with the platform. Pure
 * functions over the two fields the access gate already reads (`users/{uid}.platformBillingStatus` and
 * `platformBillingUntil`), so the list can never disagree with who is actually let in. Days are calendar days
 * in America/Sao_Paulo: an access that expires today is still valid today ("vence hoje").
 */
import { addMonths, daysBetween, localDate } from "./dates";

/** Within this many days of the expiry a paid account is shown as "vence em breve" (§35 D6). */
export const DUE_SOON_DAYS = 5;

export type MensalidadeState = "sem_plano" | "aguardando" | "teste" | "em_dia" | "vence_breve" | "atrasado";

export type BillingStatus = "pending" | "trial" | "current" | "blocked";

export interface MensalidadeInput {
  /** A `platformSubscriptions/{uid}` document exists. */
  hasSubscription: boolean;
  billingStatus: BillingStatus | null;
  billingUntil: number | null;
}

export interface Mensalidade {
  state: MensalidadeState;
  /** "YYYY-MM-DD" the access runs through, or null when there is none. */
  expiresOn: string | null;
  /** Whole days left, 0 on the last valid day; null unless the access is running with an expiry. */
  daysLeft: number | null;
  /** Whole days since the expiry day, 0 on the first day without access; null unless late. */
  daysLate: number | null;
  /** Paid and current, but with no expiry recorded (an account from before §35): "Marcar como pago" sets one. */
  noExpiry: boolean;
  /** What the rules let the trainer do right now (mirrors `trainerBillingIsCurrent`). */
  accessOpen: boolean;
}

/** The instant a payment's last valid day ends: 23:59:59.999 in São Paulo (no DST since 2019, so a fixed -03:00). */
export function endOfDayDeadline(date: string): number {
  return Date.parse(`${date}T23:59:59.999-03:00`);
}

/**
 * Where a payment made at `now` takes the expiry (§35 D1): one calendar month after the current expiry day while
 * that is still in the future — so paying during a trial counts from the trial's end — otherwise one month after today.
 */
export function nextPaidThrough(now: number, currentUntil: number | null): { date: string; until: number } {
  const base = currentUntil !== null && currentUntil > now ? localDate(currentUntil) : localDate(now);
  const date = addMonths(base, 1);
  return { date, until: endOfDayDeadline(date) };
}

export function mensalidadeOf(input: MensalidadeInput, now: number): Mensalidade {
  const { billingStatus: status, billingUntil: until } = input;
  const today = localDate(now);
  const open = status === null || ((status === "trial" || status === "current") && (until === null || until > now));
  const base = { expiresOn: until === null ? null : localDate(until), daysLeft: null, daysLate: null, noExpiry: false, accessOpen: open };

  if (!input.hasSubscription || status === null) return { ...base, state: "sem_plano" };
  if (status === "pending") return { ...base, state: "aguardando" };

  const expired = status === "blocked" || (until !== null && until <= now);
  if (expired) {
    const daysLate = until === null ? null : Math.max(0, daysBetween(localDate(until), today));
    return { ...base, state: "atrasado", daysLate };
  }
  if (status === "trial") {
    return { ...base, state: "teste", daysLeft: until === null ? null : daysBetween(today, localDate(until)) };
  }
  if (until === null) return { ...base, state: "em_dia", noExpiry: true };
  const daysLeft = daysBetween(today, localDate(until));
  return { ...base, state: daysLeft <= DUE_SOON_DAYS ? "vence_breve" : "em_dia", daysLeft };
}

const STATE_NAMES: Record<MensalidadeState, string> = {
  sem_plano: "Sem plano",
  aguardando: "Aguardando pagamento",
  teste: "Em teste",
  em_dia: "Em dia",
  vence_breve: "Vence em breve",
  atrasado: "Em atraso",
};

/** The short badge text for a state. */
export function mensalidadeStateName(state: MensalidadeState): string {
  return STATE_NAMES[state];
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** The full sentence the list shows next to the badge. */
export function mensalidadeLabel(value: Mensalidade): string {
  switch (value.state) {
    case "sem_plano": return value.accessOpen ? "Sem plano · acesso liberado (conta anterior)" : "Sem plano";
    case "aguardando": return "Aguardando pagamento";
    case "teste":
      if (value.daysLeft === null) return "Em teste";
      return value.daysLeft === 0 ? "Em teste · termina hoje" : `Em teste · ${plural(value.daysLeft, "dia restante", "dias restantes")}`;
    case "em_dia": return value.noExpiry || value.daysLeft === null ? "Em dia · sem vencimento definido" : `Em dia · vence em ${plural(value.daysLeft, "dia", "dias")}`;
    case "vence_breve": return value.daysLeft === 0 ? "Vence hoje" : `Vence em ${plural(value.daysLeft ?? 0, "dia", "dias")}`;
    case "atrasado":
      if (value.daysLate === null) return "Bloqueado";
      return value.daysLate === 0 ? "Venceu hoje" : `Em atraso há ${plural(value.daysLate, "dia", "dias")}`;
  }
}

const RANK: Record<MensalidadeState, number> = { atrasado: 0, aguardando: 1, vence_breve: 2, teste: 3, em_dia: 4, sem_plano: 5 };

/** Lower is more urgent: the order the list shows by default. */
export function mensalidadeRank(state: MensalidadeState): number {
  return RANK[state];
}
