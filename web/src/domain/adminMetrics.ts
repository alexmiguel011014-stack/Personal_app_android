import { addDays, localDate, yearMonth } from "./dates";
import { mensalidadeStateName, type MensalidadeState } from "./mensalidades";
import type { TrainerActivity, TrainerStats, TrainerUser } from "../data/converters";

export const OVERDUE_ALERT_CENTS = 10_000;

export type UsageStatus = "Ativo" | "Quieto" | "Sumido" | "Nunca entrou";

export interface TrainerRow {
  id: string;
  name: string;
  email: string;
  accessStatus: "active" | "suspended";
  lastSeenAt: number | null;
  usage: UsageStatus;
  actions30d: number;
  activeDays30d: number;
  activePlans: number;
  averageTicketCents: number | null;
  collectionRate: number | null;
  statsUpdatedAt: number;
  stale: boolean;
  stats: TrainerStats | null;
  /** The platform plan and where the personal stands with it (GOALS.md §35); absent when not loaded. */
  billing?: { planName: string | null; state: MensalidadeState; label?: string };
}

export function usageStatus(lastSeenAt: number | null, nowMs: number): UsageStatus {
  if (lastSeenAt === null) return "Nunca entrou";
  const days = Math.floor(Math.max(0, nowMs - lastSeenAt) / 86_400_000);
  if (days <= 7) return "Ativo";
  if (days <= 30) return "Quieto";
  return "Sumido";
}

export function actionsInWindow(activities: readonly TrainerActivity[], nowMs: number, timeZone: string): number {
  const months = new Set<string>();
  const today = localDate(nowMs, timeZone);
  for (let offset = 0; offset < 30; offset++) months.add(yearMonth(addDays(today, -offset)));
  return activities.reduce((total, activity) => total + (months.has(activity.month)
    ? Object.values(activity.actions).reduce((sum, count) => sum + count, 0)
    : 0), 0);
}

export function activeDaysInWindow(activities: readonly TrainerActivity[], nowMs: number, timeZone: string): number {
  const today = localDate(nowMs, timeZone);
  const firstDay = addDays(today, -29);
  const days = new Set(activities.flatMap((activity) => activity.activeDays).filter((day) => day >= firstDay && day <= today));
  return days.size;
}

export function averageTicketCents(planCents: number, activePlans: number): number | null {
  return activePlans > 0 ? planCents / activePlans : null;
}

export function collectionRate(receivedCents: number, expectedCents: number): number | null {
  return expectedCents > 0 ? receivedCents / expectedCents : null;
}

export function isStale(updatedAt: number, nowMs: number): boolean {
  return nowMs - updatedAt > 14 * 86_400_000;
}

export function trainerRow(
  trainer: TrainerUser,
  stats: TrainerStats | null,
  activities: readonly TrainerActivity[],
  nowMs: number,
  timeZone: string,
  billing?: TrainerRow["billing"],
): TrainerRow {
  const lastSeenAt = stats?.lastSeenAt ?? null;
  const activePlans = stats?.billing.activePlans ?? 0;
  const planCents = stats?.billing.planCents ?? 0;
  const updatedAt = stats?.updatedAt ?? 0;
  return {
    id: trainer.id,
    name: trainer.name,
    email: trainer.email,
    accessStatus: trainer.accessStatus,
    lastSeenAt,
    usage: usageStatus(lastSeenAt, nowMs),
    actions30d: actionsInWindow(activities, nowMs, timeZone),
    activeDays30d: activeDaysInWindow(activities, nowMs, timeZone),
    activePlans,
    averageTicketCents: averageTicketCents(planCents, activePlans),
    collectionRate: stats === null ? null : collectionRate(stats.billing.receivedCents, stats.billing.expectedCents),
    statsUpdatedAt: updatedAt,
    stale: stats === null || isStale(updatedAt, nowMs),
    stats,
    ...(billing ? { billing } : {}),
  };
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function trainersCsv(rows: readonly TrainerRow[]): string {
  const headers = ["Nome", "E-mail", "Status", "Uso", "Ações em 30 dias", "Dias ativos em 30 dias", "Planos ativos", "Ticket médio (centavos)", "Taxa de recebimento", "Plano da plataforma", "Mensalidade da plataforma"];
  const lines = [headers, ...rows.map((row) => [
    row.name,
    row.email,
    row.accessStatus,
    row.usage,
    row.actions30d,
    row.activeDays30d,
    row.activePlans,
    row.averageTicketCents ?? "",
    row.collectionRate ?? "",
    row.billing?.planName ?? "",
    row.billing ? mensalidadeStateName(row.billing.state) : "",
  ])];
  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
}
