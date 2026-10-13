import { describe, expect, it } from "vitest";
import { billingOwners } from "./billing";
import { dashboardFigures } from "./dashboard";
import type { WorkoutLogDoc } from "./metrics";
import type { Payment } from "./payments";
import type { Student } from "./students";
import { moneyFromPayments, recentSessions, trainerAttention, trainerKpis } from "./trainerHome";

const SP = "America/Sao_Paulo";
const TODAY = "2026-10-12"; // a Segunda

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    name: id,
    linked: true,
    goal: "",
    medicalNotes: "",
    trainingDays: ["Segunda", "Quarta", "Sexta"],
    createdAt: Date.parse("2026-06-01T10:00:00-03:00"),
    pendingAssessmentRequest: false,
    paused: false,
    ...overrides,
  };
}

function log(studentId: string, date: string): WorkoutLogDoc {
  return { id: `${studentId}-${date}`, trainerId: "t", studentId, workoutId: "w", exerciseName: "Supino", date: Date.parse(`${date}T07:00:00-03:00`), performedSetsJson: "[]", note: null };
}

function charge(studentId: string, dueDate: string, amountCents: number, paidAt: number | null = null): Payment {
  return { id: `${studentId}_${dueDate.slice(0, 7)}`, studentId, trainerId: "t", yearMonth: dueDate.slice(0, 7), amountCents, currency: "BRL", dueDate, paidAt, method: null, note: null, source: "manual", createdAt: 0, updatedAt: 0 } as unknown as Payment;
}

describe("trainerKpis", () => {
  const students = [student("ana"), student("bruno"), student("rascunho", { linked: false })];
  const logs = [
    log("ana", "2026-10-12"), log("ana", "2026-10-12"), // one session: two exercises on the same day
    log("ana", "2026-10-09"), log("bruno", "2026-10-07"),
    log("ana", "2026-10-05"), log("bruno", "2026-09-30"), // previous 7 days
  ];

  it("counts sessions as student × day, with the 7 days before and eight windows", () => {
    const kpis = trainerKpis({ students, logs }, TODAY, SP);
    expect(kpis.sessions.current).toBe(3);
    expect(kpis.sessions.previous).toBe(2);
    expect(kpis.sessions.delta).toEqual({ value: 1, direction: "up" });
    expect(kpis.sessions.windows).toHaveLength(8);
    expect(kpis.sessions.windows.at(-1)?.to).toBe(TODAY);
    expect(kpis.sessions.windows.at(-1)?.count).toBe(kpis.sessions.current);
  });

  it("agrees with dashboardFigures on sessions, adherence and student counts (no second definition)", () => {
    const kpis = trainerKpis({ students, logs }, TODAY, SP);
    const figures = dashboardFigures({ students, logs, payments: [] }, TODAY, SP);
    expect(kpis.sessions.current).toBe(figures.sessions);
    expect(kpis.adherence.current).toBe(figures.adherence);
    expect(kpis.students).toEqual(figures.students);
  });

  it("leaves a paused student out of every figure", () => {
    const paused = [student("ana"), student("bruno", { paused: true })];
    const kpis = trainerKpis({ students: paused, logs }, TODAY, SP);
    expect(kpis.sessions.current).toBe(2);
    expect(kpis.students.total).toBe(1);
  });

  it("has no adherence for a window where nobody had a plan, and zeros for an empty trainer", () => {
    const empty = trainerKpis({ students: [], logs: [] }, TODAY, SP);
    expect(empty.adherence).toEqual({ current: null, previous: null });
    expect(empty.sessions.windows.every((w) => w.count === 0)).toBe(true);
    expect(empty.sessions.delta.direction).toBe("same");
  });
});

describe("moneyFromPayments", () => {
  it("names the owner of a charge kept under a draft the student has claimed", () => {
    const ana = student("acct-ana", { name: "Ana" });
    const owners = billingOwners([ana], new Map([["acct-ana", "draft-ana"]]));
    const summary = { expectedCents: 100, receivedCents: 50, overdueCents: 70, overdue: [charge("draft-ana", "2026-09-05", 70)] };
    const money = moneyFromPayments(summary, owners);
    expect(money.overdue).toEqual([{ studentId: "acct-ana", name: "Ana", amountCents: 70, dueDate: "2026-09-05" }]);
  });

  it("keeps a charge whose student is gone, without a link", () => {
    const money = moneyFromPayments({ expectedCents: 0, receivedCents: 0, overdueCents: 10, overdue: [charge("ghost", "2026-09-05", 10)] }, new Map());
    expect(money.overdue[0]).toMatchObject({ studentId: null, name: "Aluno não encontrado" });
  });
});

describe("recentSessions", () => {
  it("groups the per-exercise documents of one day into one session, newest first", () => {
    const logs = [log("ana", "2026-10-11"), { ...log("ana", "2026-10-11"), id: "x2" }, { ...log("ana", "2026-10-11"), id: "x3" }, log("bruno", "2026-10-09"), log("ana", "2026-10-05")];
    expect(recentSessions(logs, SP, 2)).toEqual([
      { studentId: "ana", day: "2026-10-11", exercises: 3 },
      { studentId: "bruno", day: "2026-10-09", exercises: 1 },
    ]);
  });

  it("keeps two students' sessions on the same day apart, and is empty without logs", () => {
    expect(recentSessions([log("ana", "2026-10-11"), log("bruno", "2026-10-11")], SP, 5)).toHaveLength(2);
    expect(recentSessions([], SP, 3)).toEqual([]);
  });
});

describe("trainerAttention", () => {
  const ana = student("ana", { name: "Ana" });
  const bruno = student("bruno", { name: "Bruno" });
  const carla = student("carla", { name: "Carla", pendingAssessmentRequest: true });
  const waiting = student("maria", { name: "Maria", linked: false, createdAt: Date.parse("2026-10-01T10:00:00-03:00") });
  const fresh = student("novo", { name: "Novo", linked: false, createdAt: Date.parse("2026-10-10T10:00:00-03:00") });
  const students = [ana, bruno, carla, waiting, fresh];
  const empty = { expectedCents: 0, receivedCents: 0, overdueCents: 0, overdue: [] };

  it("orders late mensalidade → quiet → assessment → waiting, one action link each", () => {
    const money = { ...empty, overdueCents: 12000, overdue: [{ studentId: "ana", name: "Ana", amountCents: 12000, dueDate: "2026-09-05" }] };
    const items = trainerAttention({ students, money, quiet: [{ student: bruno, lastTrained: "2026-09-30" }], pendingAssessments: [carla] }, TODAY, SP);
    expect(items.map((i) => [i.kind, i.name])).toEqual([["atraso", "Ana"], ["quieto", "Bruno"], ["avaliacao", "Carla"], ["aguardando", "Maria"]]);
    expect(items[0].detail).toContain("R$");
    expect(items[0].detail).toContain("05/09/2026");
    expect(items[1].detail).toBe("Último treino em 30/09/2026");
    expect(items[3].detail).toBe("Cadastrado há 11 dias");
    expect(items.every((i) => i.href?.startsWith("/app/alunos/detalhe?id="))).toBe(true);
  });

  it("sums several overdue charges of one student into one row with the oldest due date", () => {
    const money = { ...empty, overdue: [
      { studentId: "ana", name: "Ana", amountCents: 100, dueDate: "2026-09-10" },
      { studentId: "ana", name: "Ana", amountCents: 100, dueDate: "2026-08-10" },
    ] };
    const [row, ...rest] = trainerAttention({ students: [ana], money, quiet: [], pendingAssessments: [] }, TODAY, SP);
    expect(rest).toEqual([]);
    expect(row.detail).toContain("10/08/2026");
    expect(row.detail).toContain("2,00");
  });

  it("orders late rows by oldest due date, then name (pt-BR)", () => {
    const money = { ...empty, overdue: [
      { studentId: "b", name: "Álvaro", amountCents: 1, dueDate: "2026-09-10" },
      { studentId: "a", name: "Zélia", amountCents: 1, dueDate: "2026-09-10" },
      { studentId: "c", name: "Bia", amountCents: 1, dueDate: "2026-08-01" },
    ] };
    const items = trainerAttention({ students: [], money, quiet: [], pendingAssessments: [] }, TODAY, SP);
    expect(items.map((i) => i.name)).toEqual(["Bia", "Álvaro", "Zélia"]);
  });

  it("does not nag about a draft registered less than a week ago, nor about a paused one", () => {
    const paused = student("p", { name: "Paulo", linked: false, paused: true, createdAt: Date.parse("2026-09-01T10:00:00-03:00") });
    const items = trainerAttention({ students: [fresh, paused], money: empty, quiet: [], pendingAssessments: [] }, TODAY, SP);
    expect(items).toEqual([]);
  });

  it("links nothing for a charge whose student is gone", () => {
    const money = { ...empty, overdue: [{ studentId: null, name: "Aluno não encontrado", amountCents: 5, dueDate: "2026-09-10" }] };
    expect(trainerAttention({ students: [], money, quiet: [], pendingAssessments: [] }, TODAY, SP)[0].href).toBeNull();
  });

  it("is empty when everyone is fine", () => {
    expect(trainerAttention({ students: [ana], money: empty, quiet: [], pendingAssessments: [] }, TODAY, SP)).toEqual([]);
  });
});
