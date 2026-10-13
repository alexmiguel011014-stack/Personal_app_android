import type { AuditEntry, TrainerActivity, TrainerStats, TrainerUser } from "../data/converters";
import type { PlatformPayment, PlatformSubscription } from "../data/billing/platformScope";
import { actionsInWindow, activeDaysInWindow, isStale, OVERDUE_ALERT_CENTS } from "./adminMetrics";
import type { AttentionItem } from "./attention";
import { DUE_SOON_DAYS, mensalidadeLabel, mensalidadeOf, mensalidadeStateName, STATES_IN_BOARD_ORDER, type Mensalidade, type MensalidadeState } from "./billing/standing";
import { summarize, type BillingSummary } from "./billing/summary";
import { addDays, daysBetween, localDate, yearMonth } from "./dates";
import { formatCents } from "./payments";
import { effectivePlatformMonthlyAmountCents } from "./platformBilling";
import { monthlyTotals, type CountWindow, type MonthAmount } from "./series";

// GOALS.md §37a/§37d — what the ADM's "Visão geral" shows, as pure functions over what the page loaded. The money is
// §36b's `summarize` over the same rows `/admin/mensalidades` uses, with voided payments taken out first (summarize
// counts what it is given), so the overview and the board cannot disagree.

const DAY_MS = 86_400_000;
/** Silence this long (or never having entered) puts a personal in the inbox. */
export const INACTIVE_AFTER_DAYS = 14;
export const ACTIVE_WINDOW_DAYS = 7;
export const ACTIVE_WINDOWS = 8;
export const REVENUE_MONTHS = 6;

export interface AdminHomeInput {
  trainers: readonly TrainerUser[];
  stats: readonly TrainerStats[];
  /** null when the subscriptions could not be read (the page then hides what depends on them). */
  subscriptions: ReadonlyMap<string, PlatformSubscription> | null;
  /** null when the payment ledger could not be read. */
  payments: readonly PlatformPayment[] | null;
  /** Linked students per personal: the seats the platform bills. */
  linkedByTrainer: ReadonlyMap<string, number>;
  /** The personais' activity documents, the current and the two previous months. */
  activities: readonly TrainerActivity[];
  /** Pending requests to become a personal. */
  requests: number;
}

export interface PlatformRow {
  trainer: TrainerUser;
  subscription: PlatformSubscription | null;
  standing: Mensalidade;
  monthlyCents: number | null;
}

/** Every personal and where they stand with the platform; null when the subscriptions are unavailable. */
export function platformRows(input: AdminHomeInput, now: number, timeZone: string): PlatformRow[] | null {
  const subscriptions = input.subscriptions;
  if (subscriptions === null) return null;
  return input.trainers.map((trainer) => {
    const subscription = subscriptions.get(trainer.id) ?? null;
    return {
      trainer,
      subscription,
      standing: mensalidadeOf({ hasSubscription: subscription !== null, billingStatus: trainer.platformBillingStatus ?? null, billingUntil: trainer.platformBillingUntil ?? null }, now, timeZone),
      monthlyCents: subscription ? effectivePlatformMonthlyAmountCents(subscription.terms, input.linkedByTrainer.get(trainer.id) ?? 0) : null,
    };
  });
}

const notVoided = (payments: readonly PlatformPayment[]) => payments.filter((payment) => payment.voidedAt === null);

export interface AdminKpis {
  /** What the personais pay the platform this month; null when the subscriptions cannot be read. */
  revenue: { receivedCents: number | null; expectedCents: number; planCents: number } | null;
  /** Personais by where they stand; null when the subscriptions cannot be read. */
  payers: { paying: number; trial: number; waiting: number; late: number; noPlan: number } | null;
  active: {
    /** Personais with access who visited in the last 7 days (the directory's "Ativo"). */
    current: number;
    withAccess: number;
    /** Personais with an active day in each of the last 8 weeks, from the activity documents. */
    windows: CountWindow[];
  };
  /** Students linked across the platform. */
  students: number;
}

export function adminKpis(input: AdminHomeInput, now: number, timeZone: string): AdminKpis {
  const today = localDate(now, timeZone);
  const rows = platformRows(input, now, timeZone);
  let revenue: AdminKpis["revenue"] = null;
  let payers: AdminKpis["payers"] = null;
  if (rows !== null) {
    const summary: BillingSummary = summarize(
      rows.map((row) => ({ standing: row.standing, monthlyCents: row.monthlyCents, paused: false })),
      input.payments === null ? [] : notVoided(input.payments),
      yearMonth(today),
      timeZone,
    );
    revenue = { receivedCents: input.payments === null ? null : summary.receivedCents, expectedCents: summary.expectedCents, planCents: summary.planCents };
    payers = {
      paying: summary.counts.em_dia + summary.counts.vence_breve,
      trial: summary.counts.teste,
      waiting: summary.counts.aguardando,
      late: summary.counts.atrasado,
      noPlan: summary.counts.sem_plano,
    };
  }
  const withAccess = input.trainers.filter((trainer) => trainer.accessStatus !== "suspended");
  const seen = (trainerId: string) => input.stats.find((item) => item.trainerId === trainerId)?.lastSeenAt ?? null;
  return {
    revenue,
    payers,
    active: {
      current: withAccess.filter((trainer) => { const at = seen(trainer.id); return at !== null && now - at <= ACTIVE_WINDOW_DAYS * DAY_MS; }).length,
      withAccess: withAccess.length,
      windows: activeTrainerWindows(input.activities, new Set(withAccess.map((trainer) => trainer.id)), today),
    },
    students: [...input.linkedByTrainer.values()].reduce((sum, count) => sum + count, 0),
  };
}

/** For each of the last `ACTIVE_WINDOWS` windows of 7 days: how many of these personais had at least one active day. */
export function activeTrainerWindows(activities: readonly TrainerActivity[], trainerIds: ReadonlySet<string>, today: string): CountWindow[] {
  const daysOf = new Map<string, Set<string>>();
  for (const activity of activities) {
    if (!trainerIds.has(activity.trainerId)) continue;
    const days = daysOf.get(activity.trainerId) ?? new Set<string>();
    activity.activeDays.forEach((day) => days.add(day));
    daysOf.set(activity.trainerId, days);
  }
  const windows: CountWindow[] = [];
  for (let index = ACTIVE_WINDOWS - 1; index >= 0; index--) {
    const to = addDays(today, -index * ACTIVE_WINDOW_DAYS);
    const from = addDays(to, -(ACTIVE_WINDOW_DAYS - 1));
    let count = 0;
    for (const days of daysOf.values()) if ([...days].some((day) => day >= from && day <= to)) count++;
    windows.push({ from, to, count });
  }
  return windows;
}

/** Platform money received per month (voided payments out), the last `REVENUE_MONTHS` months, oldest first. */
export function revenueByMonth(payments: readonly PlatformPayment[], today: string, timeZone: string): MonthAmount[] {
  return monthlyTotals(notVoided(payments).map((payment) => ({ at: payment.paidAt, cents: payment.amountCents })), today, REVENUE_MONTHS, timeZone);
}

export interface StateSegment {
  state: MensalidadeState;
  name: string;
  count: number;
}

/** The personais by state for the one stacked bar: board order, empty states left out. */
export function stateSegments(rows: readonly PlatformRow[]): StateSegment[] {
  return STATES_IN_BOARD_ORDER
    .filter((state) => state !== "pausado")
    .map((state) => ({ state, name: mensalidadeStateName(state), count: rows.filter((row) => row.standing.state === state).length }))
    .filter((segment) => segment.count > 0);
}

export interface UsageRow {
  trainerId: string;
  name: string;
  actions: number;
  activeDays: number;
}

/** Personais with access ranked by what they did in the last 30 days; `idle` is how many did nothing. */
export function usageRanking(input: Pick<AdminHomeInput, "trainers" | "activities">, now: number, timeZone: string): { rows: UsageRow[]; idle: number } {
  const rows: UsageRow[] = [];
  let idle = 0;
  for (const trainer of input.trainers) {
    if (trainer.accessStatus === "suspended") continue;
    const own = input.activities.filter((activity) => activity.trainerId === trainer.id);
    const actions = actionsInWindow(own, now, timeZone);
    if (actions === 0) { idle++; continue; }
    rows.push({ trainerId: trainer.id, name: trainer.name || trainer.email, actions, activeDays: activeDaysInWindow(own, now, timeZone) });
  }
  rows.sort((a, b) => b.actions - a.actions || b.activeDays - a.activeDays || a.name.localeCompare(b.name, "pt-BR"));
  return { rows, idle };
}

export type AdminAttentionKind = "solicitacao" | "atraso" | "aguardando" | "teste" | "vence" | "cobranca" | "inativo";

const trainerHref = (id: string) => `/admin/personais/detalhe?id=${encodeURIComponent(id)}`;

/**
 * Who needs the ADM, most urgent first: requests waiting → late → waiting for a first payment → trial ending → due
 * soon → their alunos' charges late → silent. One row per personal, the most urgent reason on top and the others in the
 * detail. Suspended personais are left out (nothing to do for them here).
 */
export function adminAttention(input: AdminHomeInput, now: number, timeZone: string): AttentionItem<AdminAttentionKind>[] {
  const items: AttentionItem<AdminAttentionKind>[] = [];
  if (input.requests > 0) {
    items.push({
      id: "solicitacoes",
      kind: "solicitacao",
      name: `${input.requests} ${input.requests === 1 ? "solicitação" : "solicitações"} de acesso`,
      reason: "Aguardando resposta",
      detail: "Alguém pediu para virar personal.",
      href: "/admin/solicitacoes",
      actionLabel: "Abrir solicitações",
    });
  }

  const rows = platformRows(input, now, timeZone);
  const today = localDate(now, timeZone);
  const perTrainer: { rank: number; name: string; item: AttentionItem<AdminAttentionKind> }[] = [];
  for (const trainer of input.trainers) {
    if (trainer.accessStatus === "suspended") continue;
    const row = rows?.find((candidate) => candidate.trainer.id === trainer.id) ?? null;
    const stats = input.stats.find((item) => item.trainerId === trainer.id) ?? null;
    const plan = row?.subscription ? `${row.subscription.terms.planName ?? "Plano"} · ${formatCents(row.monthlyCents ?? 0)}/mês` : "";
    const reasons: { rank: number; kind: AdminAttentionKind; reason: string; detail: string }[] = [];
    if (row) {
      const state = row.standing.state;
      if (state === "atrasado") reasons.push({ rank: 1, kind: "atraso", reason: "Mensalidade em atraso", detail: [mensalidadeLabel(row.standing), plan].filter(Boolean).join(" · ") });
      if (state === "aguardando") reasons.push({ rank: 2, kind: "aguardando", reason: "Aguardando o 1º pagamento", detail: plan });
      if (state === "teste" && row.standing.daysLeft !== null && row.standing.daysLeft <= DUE_SOON_DAYS) reasons.push({ rank: 3, kind: "teste", reason: "Teste termina em breve", detail: mensalidadeLabel(row.standing) });
      if (state === "vence_breve") reasons.push({ rank: 4, kind: "vence", reason: "Mensalidade vence em breve", detail: mensalidadeLabel(row.standing) });
    }
    if ((stats?.billing.overdueCents ?? 0) > OVERDUE_ALERT_CENTS) {
      reasons.push({ rank: 5, kind: "cobranca", reason: "Cobranças dos alunos em atraso", detail: `${formatCents(stats?.billing.overdueCents ?? 0)} em aberto` });
    }
    const lastSeen = stats?.lastSeenAt ?? null;
    if (lastSeen === null) reasons.push({ rank: 6, kind: "inativo", reason: "Nunca entrou", detail: "Ainda não abriu o site." });
    else if (now - lastSeen > INACTIVE_AFTER_DAYS * DAY_MS) reasons.push({ rank: 6, kind: "inativo", reason: "Sem atividade", detail: `Última visita há ${daysBetween(localDate(lastSeen, timeZone), today)} dias` });
    if (reasons.length === 0) continue;
    reasons.sort((a, b) => a.rank - b.rank);
    const [first, ...others] = reasons;
    perTrainer.push({
      rank: first.rank,
      name: trainer.name || trainer.email,
      item: {
        id: `personal:${trainer.id}`,
        kind: first.kind,
        name: trainer.name || trainer.email,
        reason: first.reason,
        detail: [first.detail, others.length > 0 ? `Também: ${others.map((other) => other.reason.toLowerCase()).join(", ")}` : ""].filter(Boolean).join(" · "),
        href: trainerHref(trainer.id),
        actionLabel: "Abrir personal",
      },
    });
  }
  perTrainer.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "pt-BR"));
  return [...items, ...perTrainer.map((entry) => entry.item)];
}

/** Personais with access whose usage summary is missing or older than two weeks (a footnote, not an alert). */
export function staleSummaryCount(input: Pick<AdminHomeInput, "trainers" | "stats">, now: number): number {
  return input.trainers.filter((trainer) => {
    if (trainer.accessStatus === "suspended") return false;
    const stats = input.stats.find((item) => item.trainerId === trainer.id);
    return stats === undefined || isStale(stats.updatedAt, now);
  }).length;
}

/** What the personais charge their own alunos this month (the personais' own number, not the platform's); null when no summary is for this month. */
export function studentChargeTotals(stats: readonly TrainerStats[], month: string): { expectedCents: number; receivedCents: number; overdueCents: number } | null {
  const current = stats.filter((item) => item.billing.month === month);
  if (current.length === 0) return null;
  return {
    expectedCents: current.reduce((sum, item) => sum + item.billing.expectedCents, 0),
    receivedCents: current.reduce((sum, item) => sum + item.billing.receivedCents, 0),
    overdueCents: current.reduce((sum, item) => sum + item.billing.overdueCents, 0),
  };
}

export const AUDIT_ACTION_NAMES: Record<string, string> = {
  "trainer.create": "Personal cadastrado",
  "trainer.suspend": "Acesso suspenso",
  "trainer.reactivate": "Acesso reativado",
  "trainer.promote": "Personal promovido",
  "request.reject": "Solicitação recusada",
  "trainer.resetEmail": "Redefinição de senha enviada",
  "payment.record": "Pagamento da mensalidade registrado",
  "payment.void": "Pagamento estornado",
  "subscription.assign": "Plano atribuído",
  "platform.plan.create": "Plano criado",
  "platform.plan.update": "Plano atualizado",
  "trial.extend": "Teste prorrogado",
};

export interface AuditRow {
  id: string;
  at: number;
  title: string;
  /** The personal the action was about, by name; the account id only when they are not in the list. */
  subject: string;
  note: string;
}

export function auditRows(entries: readonly AuditEntry[], trainers: readonly TrainerUser[]): AuditRow[] {
  return entries.map((entry) => {
    const trainer = trainers.find((candidate) => candidate.id === entry.targetUid);
    return {
      id: entry.id,
      at: entry.at,
      title: AUDIT_ACTION_NAMES[entry.action] ?? entry.action,
      subject: trainer ? trainer.name || trainer.email : `Conta ${entry.targetUid.slice(0, 6)}…`,
      note: entry.note,
    };
  });
}
