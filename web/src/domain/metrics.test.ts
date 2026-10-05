import { describe, expect, it } from "vitest";
import {
  adherence,
  overallAdherence,
  paymentSummary,
  pendingAssessments,
  quietStudents,
  sessionsBetween,
  studentCounts,
  trainedDays,
  type WorkoutLogDoc,
} from "./metrics";
import type { Payment } from "./payments";
import type { Student } from "./students";

const SP = "America/Sao_Paulo";
const TODAY = "2026-09-22"; // a Terça
const FOUR_WEEKS_AGO = "2026-08-26"; // 28 days ending TODAY: exactly four of every weekday

function log(studentId: string, isoWithOffset: string, exerciseName = "Supino"): WorkoutLogDoc {
  return {
    id: `${studentId}-${isoWithOffset}-${exerciseName}`,
    trainerId: "t1",
    studentId,
    workoutId: "w1",
    exerciseName,
    date: Date.parse(isoWithOffset),
    performedSetsJson: "[]",
    note: null,
  };
}

function morningsOf(studentId: string, dates: string[]): WorkoutLogDoc[] {
  return dates.map((date) => log(studentId, `${date}T07:00:00-03:00`));
}

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    name: id,
    linked: true,
    goal: "",
    medicalNotes: "",
    trainingDays: [],
    createdAt: Date.parse("2026-08-01T12:00:00-03:00"),
    pendingAssessmentRequest: false,
    paused: false,
    ...overrides,
  };
}

describe("trainedDays", () => {
  it("counts a session once, however many exercise documents it wrote", () => {
    // One session, three exercises: three documents, timestamps milliseconds apart.
    const trained = trainedDays(
      [
        log("s1", "2026-09-21T07:00:00.000-03:00", "Supino"),
        log("s1", "2026-09-21T07:00:00.004-03:00", "Remada"),
        log("s1", "2026-09-21T07:00:00.011-03:00", "Agachamento"),
      ],
      SP,
    );
    expect(trained.get("s1")).toEqual(new Set(["2026-09-21"]));
    expect(sessionsBetween(trained, "2026-09-21", "2026-09-21")).toBe(1);
  });

  it("puts a late-evening log on the trainer's local day", () => {
    // 22:30 in São Paulo is already the next day in UTC.
    const trained = trainedDays([log("s1", "2026-09-30T22:30:00-03:00")], SP);
    expect(trained.get("s1")).toEqual(new Set(["2026-09-30"]));
  });
});

describe("sessionsBetween", () => {
  it("counts student-days inside the window only", () => {
    const trained = trainedDays(
      [
        log("s1", "2026-09-16T08:00:00-03:00"), // before the window
        log("s1", "2026-09-17T08:00:00-03:00"),
        log("s1", "2026-09-22T08:00:00-03:00"),
        log("s2", "2026-09-22T19:00:00-03:00"),
      ],
      SP,
    );
    expect(sessionsBetween(trained, "2026-09-17", TODAY)).toBe(3);
  });
});

describe("studentCounts and pendingAssessments", () => {
  it("splits linked from pending and lists assessment requests", () => {
    const students = [
      student("a"),
      student("b", { pendingAssessmentRequest: true }),
      student("c", { linked: false }),
      student("paused", { paused: true, pendingAssessmentRequest: true }),
    ];
    expect(studentCounts(students)).toEqual({ total: 3, linked: 2, pending: 1 });
    expect(pendingAssessments(students).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("adherence", () => {
  const plan = ["Segunda", "Quarta", "Sexta"];

  it("counts planned days in the window, and every day trained whether planned or not", () => {
    const trained = trainedDays(
      [
        ...morningsOf("s1", [
          "2026-09-21", // Segunda
          "2026-09-18", // Sexta
          "2026-09-16", // Quarta
          "2026-09-14", // Segunda
          "2026-09-11", // Sexta
          "2026-09-09", // Quarta
        ]),
        log("s1", "2026-09-19T10:00:00-03:00"), // Sábado: not planned, still a trained day
      ],
      SP,
    );
    expect(adherence(student("s1", { trainingDays: plan }), trained, FOUR_WEEKS_AGO, TODAY, SP)).toEqual({
      expected: 12,
      done: 7,
      ratio: 7 / 12,
    });
  });

  it("never goes past 100%", () => {
    const trained = trainedDays(
      morningsOf("s1", ["2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]),
      SP,
    );
    const result = adherence(student("s1", { trainingDays: ["Segunda"] }), trained, FOUR_WEEKS_AGO, TODAY, SP);
    expect(result?.ratio).toBe(1);
  });

  it("starts the window on the day a new student joined", () => {
    // Joined on Domingo the 20th: the only planned day since then is Segunda the 21st.
    const newcomer = student("s1", {
      trainingDays: plan,
      createdAt: Date.parse("2026-09-20T15:00:00-03:00"),
    });
    const trained = trainedDays([log("s1", "2026-09-21T07:00:00-03:00")], SP);
    expect(adherence(newcomer, trained, FOUR_WEEKS_AGO, TODAY, SP)).toEqual({
      expected: 1,
      done: 1,
      ratio: 1,
    });
  });

  it("matches a decomposed 'Terça' (c + combining cedilla)", () => {
    const result = adherence(student("s1", { trainingDays: ["Terça"] }), new Map(), FOUR_WEEKS_AGO, TODAY, SP);
    expect(result?.expected).toBe(4);
  });

  it("is null for drafts and for students without a plan", () => {
    expect(adherence(student("s1", { linked: false, trainingDays: plan }), new Map(), FOUR_WEEKS_AGO, TODAY, SP)).toBeNull();
    expect(adherence(student("s1"), new Map(), FOUR_WEEKS_AGO, TODAY, SP)).toBeNull();
  });

  it("pools students by planned days, ignoring those without a plan", () => {
    const students = [
      student("a", { trainingDays: ["Segunda"] }), // 4 planned
      student("b", { trainingDays: plan }), // 12 planned
      student("c"), // no plan
    ];
    const trained = trainedDays(
      [
        ...morningsOf("a", ["2026-09-21", "2026-09-14"]), // 2 of 4
        ...morningsOf("b", ["2026-09-21", "2026-09-18", "2026-09-16", "2026-09-14", "2026-09-11", "2026-09-09"]), // 6 of 12
      ],
      SP,
    );
    expect(overallAdherence(students, trained, FOUR_WEEKS_AGO, TODAY, SP)).toBe(8 / 16);
  });

  it("omits paused students from adherence, quiet, and pending-assessment indicators", () => {
    const paused = student("paused", { paused: true, trainingDays: ["Segunda"], pendingAssessmentRequest: true });
    const trained = trainedDays(morningsOf("paused", ["2026-09-01"]), SP);
    expect(adherence(paused, trained, FOUR_WEEKS_AGO, TODAY, SP)).toBeNull();
    expect(quietStudents([paused], trained, TODAY, 7, SP)).toEqual([]);
    expect(pendingAssessments([paused])).toEqual([]);
  });
});

describe("quietStudents", () => {
  it("flags linked students with no session in the window, never-trained first", () => {
    const students = [
      student("trained-recently"),
      student("quiet"),
      student("never"),
      student("new", { createdAt: Date.parse("2026-09-20T12:00:00-03:00") }), // joined inside the window
      student("draft", { linked: false }),
      student("joined-at-window-start", { createdAt: Date.parse("2026-09-16T09:00:00-03:00") }),
    ];
    const trained = trainedDays(
      [log("trained-recently", "2026-09-20T07:00:00-03:00"), log("quiet", "2026-09-10T07:00:00-03:00")],
      SP,
    );
    const quiet = quietStudents(students, trained, TODAY, 7, SP);
    expect(quiet.map((q) => [q.student.id, q.lastTrained])).toEqual([
      ["never", null],
      ["joined-at-window-start", null],
      ["quiet", "2026-09-10"],
    ]);
  });
});

describe("paymentSummary", () => {
  function charge(id: string, dueDate: string, amountCents: number, paidAt: string | null): Payment {
    return {
      id,
      trainerId: "t1",
      studentId: id,
      amountCents,
      currency: "BRL",
      dueDate,
      paidAt: paidAt === null ? null : Date.parse(paidAt),
      method: null,
      source: "manual",
      externalId: null,
      note: null,
      createdAt: 0,
    };
  }

  it("separates what's due this month, what came in this month, and what's late", () => {
    const summary = paymentSummary(
      [
        charge("on-time", "2026-09-10", 15000, "2026-09-09T10:00:00-03:00"),
        charge("late-unpaid", "2026-09-10", 20000, null),
        charge("august-paid-in-september", "2026-08-10", 15000, "2026-09-02T10:00:00-03:00"),
        charge("not-due-yet", "2026-09-25", 18000, null),
        charge("july-unpaid", "2026-07-10", 12000, null),
        // 23:00 on Aug 31st in São Paulo is already Sept 1st in UTC. It's August money.
        charge("paid-last-night-of-august", "2026-08-31", 10000, "2026-09-01T02:00:00Z"),
      ],
      TODAY,
      SP,
    );
    expect(summary.expectedCents).toBe(15000 + 20000 + 18000);
    expect(summary.receivedCents).toBe(15000 + 15000);
    expect(summary.overdue.map((p) => p.id)).toEqual(["july-unpaid", "late-unpaid"]);
    expect(summary.overdueCents).toBe(12000 + 20000);
  });
});
