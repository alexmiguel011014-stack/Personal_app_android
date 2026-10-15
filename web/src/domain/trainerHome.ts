import type { AnamnesisAlert } from "./anamnesisAlerts";
import type { AttentionItem as GenericAttentionItem } from "./attention";
import type { BillingOwner } from "./billing";
import { addDays, daysBetween, formatDate, localDate } from "./dates";
import { overallAdherence, studentCounts, trainedDays, type PaymentSummary, type QuietStudent, type StudentCounts, type TrainedDays, type WorkoutLogDoc } from "./metrics";
import { formatCents } from "./payments";
import { delta, windowedCounts, type Delta } from "./series";
import { effortLabel, isUnseenPain, type SessionFeedback } from "./sessionFeedback";
import { filterStudentsByPause, type Student } from "./students";

// GOALS.md §37a/§37c — what the trainer's "Hoje" shows, as pure functions over the documents the page has already
// loaded. Every figure is one of §23c's definitions (sessions, adherence, quiet) — never a second one — so a card can
// not disagree with `dashboardFigures`, which still feeds the ADM's directory.

export const SESSIONS_WINDOW_DAYS = 7;
export const ADHERENCE_WINDOW_DAYS = 28;
/** How many windows of `SESSIONS_WINDOW_DAYS` the small bar chart shows. */
export const SESSION_WINDOWS = 8;
/** A student who registered but has not connected for this many days is worth a nudge. */
export const WAITING_AFTER_DAYS = 7;

export const studentHref = (id: string): string => `/app/alunos/detalhe?id=${encodeURIComponent(id)}`;

export interface TrainerKpis {
  sessions: {
    current: number;
    previous: number;
    delta: Delta;
    /** `SESSION_WINDOWS` rolling windows, the newest ending today (its count is `current`). */
    windows: { from: string; to: string; count: number }[];
  };
  adherence: { current: number | null; previous: number | null };
  students: StudentCounts;
}

export function trainerKpis(input: { students: readonly Student[]; logs: readonly WorkoutLogDoc[] }, today: string, timeZone: string): TrainerKpis {
  const active = filterStudentsByPause(input.students);
  const pausedIds = new Set(input.students.filter((student) => student.paused).map((student) => student.id));
  const trained = trainedDays(input.logs.filter((log) => !pausedIds.has(log.studentId)), timeZone);
  const windows = windowedCounts(allDays(trained), today, SESSIONS_WINDOW_DAYS, SESSION_WINDOWS);
  const current = windows[windows.length - 1].count;
  const previous = windows[windows.length - 2].count;
  const adherenceTo = (to: string) => overallAdherence(active, trained, addDays(to, -(ADHERENCE_WINDOW_DAYS - 1)), to, timeZone);
  return {
    sessions: { current, previous, delta: delta(current, previous), windows },
    adherence: { current: adherenceTo(today), previous: adherenceTo(addDays(today, -ADHERENCE_WINDOW_DAYS)) },
    students: studentCounts(active),
  };
}

function allDays(trained: TrainedDays): string[] {
  return [...trained.values()].flatMap((days) => [...days]);
}

/** The Mensalidades card and the overdue rows of the inbox: one small input, so §36 can swap how it is built. */
export interface TrainerMoney {
  expectedCents: number;
  receivedCents: number;
  overdueCents: number;
  /** One entry per charge, oldest due date first. */
  overdue: { studentId: string | null; name: string; amountCents: number; dueDate: string }[];
}

/** Builds the money input from today's per-charge model. */
export function moneyFromPayments(summary: PaymentSummary, owners: ReadonlyMap<string, BillingOwner>): TrainerMoney {
  return {
    expectedCents: summary.expectedCents,
    receivedCents: summary.receivedCents,
    overdueCents: summary.overdueCents,
    overdue: summary.overdue.map((charge) => {
      const owner = owners.get(charge.studentId);
      return { studentId: owner?.id ?? null, name: owner?.name ?? "Aluno não encontrado", amountCents: charge.amountCents, dueDate: charge.dueDate };
    }),
  };
}

export interface RecentSession {
  studentId: string;
  /** The local day, "YYYY-MM-DD". */
  day: string;
  /** How many exercises were logged that day (the phone writes one document per exercise). */
  exercises: number;
}

/** The latest `count` sessions (student × day, §23c's definition), newest first — not the latest documents, which would be one session. */
export function recentSessions(logs: readonly WorkoutLogDoc[], timeZone: string, count: number): RecentSession[] {
  const sessions = new Map<string, RecentSession & { last: number }>();
  for (const log of logs) {
    const day = localDate(log.date, timeZone);
    const key = `${log.studentId}|${day}`;
    const session = sessions.get(key);
    if (session) {
      session.exercises += 1;
      session.last = Math.max(session.last, log.date);
    } else {
      sessions.set(key, { studentId: log.studentId, day, exercises: 1, last: log.date });
    }
  }
  return [...sessions.values()].sort((a, b) => b.last - a.last).slice(0, count).map(({ studentId, day, exercises }) => ({ studentId, day, exercises }));
}

export type AttentionKind = "dor" | "atraso" | "quieto" | "comentario" | "avaliacao" | "anamnese" | "aguardando";
type AttentionItem = GenericAttentionItem<AttentionKind>;

export interface TrainerAttentionInput {
  students: readonly Student[];
  money: TrainerMoney;
  quiet: readonly QuietStudent[];
  pendingAssessments: readonly Student[];
  /** GOALS.md §38i: the alunos' feedback of the last FEEDBACK_ATTENTION_DAYS days (the snapshot's), for the pain and comment rows. */
  feedback?: readonly SessionFeedback[];
  /** GOALS.md §38i: anamneses with a flag that this device has not opened (domain/anamnesisAlerts.ts). */
  anamneses?: readonly AnamnesisAlert[];
}

/** "Relatou dor" and "Comentário não visto" look at the last seven days, today included. */
export const FEEDBACK_ALERT_DAYS = 7;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "pt-BR");

/**
 * Who needs the trainer, most urgent first: pain reported (GOALS.md §38i) → late mensalidade → quiet → an aluno's
 * comment not yet seen → assessment waiting → anamnese with a flag → not yet connected.
 * The whole list; the screen shows the first few and folds the rest.
 */
export function trainerAttention(input: TrainerAttentionInput, today: string, timeZone: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const nameOf = (studentId: string) => input.students.find((student) => student.id === studentId)?.name ?? "Aluno não encontrado";
  const since = addDays(today, -(FEEDBACK_ALERT_DAYS - 1));
  const recentFeedback = (input.feedback ?? []).filter((item) => item.day >= since && item.day <= today);

  // Pain first: one row per aluno, for their latest session with a pain report nobody has looked at.
  const painByStudent = new Map<string, SessionFeedback>();
  for (const item of recentFeedback.filter(isUnseenPain)) {
    const known = painByStudent.get(item.studentId);
    if (!known || item.day > known.day) painByStudent.set(item.studentId, item);
  }
  [...painByStudent.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || nameOf(a.studentId).localeCompare(nameOf(b.studentId), "pt-BR"))
    .forEach((item) => {
      const effort = effortLabel(item.effort);
      items.push({
        id: `dor:${item.studentId}`,
        kind: "dor",
        name: nameOf(item.studentId),
        reason: "Relatou dor",
        detail: `Treino de ${formatDate(item.day)}${effort === null ? "" : ` · esforço ${effort.toLowerCase()}`}`,
        href: studentHref(item.studentId),
        actionLabel: "Ver aluno",
      });
    });

  // One row per student with the sum of what they owe and the oldest due date.
  const late = new Map<string, { studentId: string | null; name: string; cents: number; dueDate: string }>();
  for (const charge of input.money.overdue) {
    const key = charge.studentId ?? `?${charge.name}`;
    const row = late.get(key);
    if (row) {
      row.cents += charge.amountCents;
      if (charge.dueDate < row.dueDate) row.dueDate = charge.dueDate;
    } else {
      late.set(key, { studentId: charge.studentId, name: charge.name, cents: charge.amountCents, dueDate: charge.dueDate });
    }
  }
  [...late.values()]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || byName(a, b))
    .forEach((row) => items.push({
      id: `atraso:${row.studentId ?? row.name}`,
      kind: "atraso",
      name: row.name,
      reason: "Mensalidade em atraso",
      detail: `${formatCents(row.cents)} · venceu em ${formatDate(row.dueDate)}`,
      href: row.studentId === null ? null : studentHref(row.studentId),
      actionLabel: "Ver aluno",
    }));

  for (const { student, lastTrained } of input.quiet) {
    items.push({
      id: `quieto:${student.id}`,
      kind: "quieto",
      name: student.name,
      reason: "Sem treinar",
      detail: lastTrained === null ? "Nunca registrou treino" : `Último treino em ${formatDate(lastTrained)}`,
      href: studentHref(student.id),
      actionLabel: "Ver aluno",
    });
  }

  // A comment the aluno wrote that the personal has not seen (pain already has its row above).
  const commentByStudent = new Map<string, SessionFeedback>();
  for (const item of recentFeedback) {
    if (item.studentComment === "" || item.trainerSeenAt !== null || painByStudent.has(item.studentId)) continue;
    const known = commentByStudent.get(item.studentId);
    if (!known || item.day > known.day) commentByStudent.set(item.studentId, item);
  }
  [...commentByStudent.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || nameOf(a.studentId).localeCompare(nameOf(b.studentId), "pt-BR"))
    .forEach((item) => items.push({
      id: `comentario:${item.studentId}`,
      kind: "comentario",
      name: nameOf(item.studentId),
      reason: "Comentário não visto",
      detail: `Sobre o treino de ${formatDate(item.day)}`,
      href: studentHref(item.studentId),
      actionLabel: "Ver aluno",
    }));

  [...input.pendingAssessments].sort(byName).forEach((student) => items.push({
    id: `avaliacao:${student.id}`,
    kind: "avaliacao",
    name: student.name,
    reason: "Avaliação pendente",
    detail: "O aluno ainda não respondeu",
    href: studentHref(student.id),
    actionLabel: "Ver aluno",
  }));

  for (const alert of input.anamneses ?? []) {
    items.push({
      id: `anamnese:${alert.assessmentId}`,
      kind: "anamnese",
      name: nameOf(alert.studentId),
      reason: "Anamnese com ponto de atenção",
      detail: `${alert.points} ${alert.points === 1 ? "ponto" : "pontos"} de atenção · enviada em ${formatDate(localDate(alert.submittedAt, timeZone))}`,
      href: `/app/alunos/anamnese?aluno=${encodeURIComponent(alert.studentId)}&id=${encodeURIComponent(alert.assessmentId)}`,
      actionLabel: "Ver relatório",
    });
  }

  filterStudentsByPause(input.students)
    .filter((student) => !student.linked && daysBetween(localDate(student.createdAt, timeZone), today) >= WAITING_AFTER_DAYS)
    .sort((a, b) => a.createdAt - b.createdAt || byName(a, b))
    .forEach((student) => {
      const days = daysBetween(localDate(student.createdAt, timeZone), today);
      items.push({
        id: `aguardando:${student.id}`,
        kind: "aguardando",
        name: student.name,
        reason: "Aguardando conexão",
        detail: `Cadastrado há ${days} dias`,
        href: studentHref(student.id),
        actionLabel: "Ver aluno",
      });
    });

  return items;
}
