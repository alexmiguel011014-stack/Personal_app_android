import { describe, expect, it } from "vitest";
import { dashboardFigures } from "./dashboard";
import { formatDate, formatYearMonth } from "./dates";
import type { WorkoutLogDoc } from "./metrics";
import { formatCents, type Payment } from "./payments";
import { matchesSearch, type Student } from "./students";

const SP = "America/Sao_Paulo";
const TODAY = "2026-09-22"; // a Terça
const LONG_AGO = Date.parse("2026-08-01T12:00:00-03:00");

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    name: id,
    linked: true,
    goal: "",
    medicalNotes: "",
    trainingDays: [],
    createdAt: LONG_AGO,
    pendingAssessmentRequest: false,
    paused: false,
    ...overrides,
  };
}

function trainedOn(studentId: string, dates: string[]): WorkoutLogDoc[] {
  return dates.map((date) => ({
    id: `${studentId}-${date}`,
    trainerId: "t1",
    studentId,
    workoutId: "w1",
    exerciseName: "Supino",
    date: Date.parse(`${date}T07:00:00-03:00`),
    performedSetsJson: "[]",
    note: null,
  }));
}

function charge(studentId: string, dueDate: string, amountCents: number, paidOn: string | null): Payment {
  return {
    id: `${studentId}_${dueDate.slice(0, 7)}`,
    trainerId: "t1",
    studentId,
    amountCents,
    currency: "BRL",
    dueDate,
    paidAt: paidOn === null ? null : Date.parse(`${paidOn}T10:00:00-03:00`),
    method: paidOn === null ? null : "pix",
    source: "manual",
    externalId: null,
    note: null,
    createdAt: 0,
  };
}

describe("dashboardFigures", () => {
  it("adds up a small roster the way the §23c definitions say", () => {
    const figures = dashboardFigures(
      {
        students: [
          student("ana", { trainingDays: ["Segunda", "Quarta", "Sexta"] }), // 12 planned in 28 days
          student("bruno", { trainingDays: ["Terça", "Quinta"] }), // 8 planned in 28 days
          student("diego", { pendingAssessmentRequest: true }), // no plan: no adherence
          student("pedro", { linked: false }),
        ],
        logs: [
          ...trainedOn("ana", ["2026-09-21", "2026-09-18", "2026-09-16", "2026-09-14", "2026-09-11", "2026-09-09"]),
          ...trainedOn("bruno", ["2026-09-10"]),
          ...trainedOn("diego", ["2026-09-20"]),
        ],
        payments: [
          charge("ana", "2026-09-10", 15000, "2026-09-08"),
          charge("bruno", "2026-09-05", 12000, null),
          charge("bruno", "2026-08-05", 12000, null),
        ],
      },
      TODAY,
      SP,
    );

    expect(figures.students).toEqual({ total: 4, linked: 3, pending: 1 });
    expect(figures.sessions).toBe(4); // Ana 21/18/16 + Diego 20, all inside 16–22 September
    expect(figures.adherence).toBe((6 + 1) / (12 + 8));
    expect(figures.quiet.map((q) => [q.student.id, q.lastTrained])).toEqual([["bruno", "2026-09-10"]]);
    expect(figures.pendingAssessments.map((s) => s.id)).toEqual(["diego"]);
    expect(figures.payments.expectedCents).toBe(27000);
    expect(figures.payments.receivedCents).toBe(15000);
    expect(figures.payments.overdue.map((p) => p.dueDate)).toEqual(["2026-08-05", "2026-09-05"]);
    expect(figures.payments.overdueCents).toBe(24000);
  });

  it("excludes paused students from dashboard activity but keeps their billing intact", () => {
    const figures = dashboardFigures(
      {
        students: [
          student("active", { trainingDays: ["Segunda"] }),
          student("paused", { paused: true, trainingDays: ["Segunda"], pendingAssessmentRequest: true }),
        ],
        logs: [
          ...trainedOn("active", ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21"]),
          ...trainedOn("paused", ["2026-09-21"]),
        ],
        payments: [charge("paused", "2026-09-10", 15000, null)],
      },
      TODAY,
      SP,
    );
    expect(figures.students).toEqual({ total: 1, linked: 1, pending: 0 });
    expect(figures.sessions).toBe(1);
    expect(figures.adherence).toBe(1);
    expect(figures.pendingAssessments).toEqual([]);
    expect(figures.payments.expectedCents).toBe(15000);
    expect(figures.payments.overdueCents).toBe(15000);
  });
});

describe("display helpers", () => {
  const plain = (text: string) => text.replace(/\s/g, " "); // Intl puts a no-break space after R$

  it("formats cents as reais without a float in between", () => {
    expect(plain(formatCents(15010))).toBe("R$ 150,10");
    expect(plain(formatCents(123456))).toBe("R$ 1.234,56");
    expect(plain(formatCents(0))).toBe("R$ 0,00");
  });

  it("formats dates and months the way the trainer reads them", () => {
    expect(formatDate("2026-09-10")).toBe("10/09/2026");
    expect(formatYearMonth("2026-09")).toBe("setembro de 2026");
  });

  it("searches names ignoring case and accents", () => {
    expect(matchesSearch("João Silva", "joao")).toBe(true);
    expect(matchesSearch("Ana Costa", "ANA")).toBe(true);
    expect(matchesSearch("Ana Costa", "bruno")).toBe(false);
    expect(matchesSearch("Maria", "")).toBe(true);
  });
});
