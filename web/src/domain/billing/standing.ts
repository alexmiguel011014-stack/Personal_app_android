/**
 * GOALS.md §35/§36: where a payer stands with whoever bills them — the same seven states for the ADM billing a
 * personal and a personal billing an aluno. Pure functions over the two stored fields (`status`, `until`), so a list
 * can never disagree with the access gate that reads the same two fields. Days are calendar days in
 * America/Sao_Paulo (or the zone passed): an access that expires today is still valid today ("vence hoje").
 */
import { daysBetween, localDate } from "../dates";

/** Within this many days of the expiry a paid account is shown as "vence em breve" (§35 D6). */
export const DUE_SOON_DAYS = 5;

export type MensalidadeState = "sem_plano" | "aguardando" | "teste" | "em_dia" | "vence_breve" | "atrasado" | "pausado";

export type BillingStatus = "pending" | "trial" | "current" | "blocked";

export interface MensalidadeInput {
  /** A subscription exists for this payer. */
  hasSubscription: boolean;
  billingStatus: BillingStatus | null;
  billingUntil: number | null;
  /** The billing was paused on purpose (aluno plans only): nothing is expected until it is resumed. */
  paused?: boolean;
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
  /** What the rules let the payer do right now (mirrors `trainerBillingIsCurrent`). */
  accessOpen: boolean;
}

export function mensalidadeOf(input: MensalidadeInput, now: number, timeZone?: string): Mensalidade {
  const { billingStatus: status, billingUntil: until } = input;
  const today = localDate(now, timeZone);
  const open = status === null || ((status === "trial" || status === "current") && (until === null || until > now));
  const base = { expiresOn: until === null ? null : localDate(until, timeZone), daysLeft: null, daysLate: null, noExpiry: false, accessOpen: open };

  if (!input.hasSubscription || status === null) return { ...base, state: "sem_plano" };
  if (input.paused) return { ...base, state: "pausado" };
  if (status === "pending") return { ...base, state: "aguardando" };

  const expired = status === "blocked" || (until !== null && until <= now);
  if (expired) {
    const daysLate = until === null ? null : Math.max(0, daysBetween(localDate(until, timeZone), today));
    return { ...base, state: "atrasado", daysLate };
  }
  if (status === "trial") {
    return { ...base, state: "teste", daysLeft: until === null ? null : daysBetween(today, localDate(until, timeZone)) };
  }
  if (until === null) return { ...base, state: "em_dia", noExpiry: true };
  const daysLeft = daysBetween(today, localDate(until, timeZone));
  return { ...base, state: daysLeft <= DUE_SOON_DAYS ? "vence_breve" : "em_dia", daysLeft };
}

const STATE_NAMES: Record<MensalidadeState, string> = {
  sem_plano: "Sem plano",
  aguardando: "Aguardando pagamento",
  teste: "Em teste",
  em_dia: "Em dia",
  vence_breve: "Vence em breve",
  atrasado: "Em atraso",
  pausado: "Pausado",
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
    case "pausado": return "Pausado";
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

const RANK: Record<MensalidadeState, number> = { atrasado: 0, aguardando: 1, vence_breve: 2, teste: 3, em_dia: 4, pausado: 5, sem_plano: 6 };

/** Lower is more urgent: the order the list shows by default. */
export function mensalidadeRank(state: MensalidadeState): number {
  return RANK[state];
}

/** Every state in the order the summary figures are shown (the list itself sorts by `mensalidadeRank`). */
export const STATES_IN_BOARD_ORDER: readonly MensalidadeState[] = ["atrasado", "vence_breve", "aguardando", "teste", "em_dia", "pausado", "sem_plano"];
