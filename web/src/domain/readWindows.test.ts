import { describe, expect, it } from "vitest";
import { dashboardFigures } from "./dashboard";
import type { WorkoutLogDoc } from "./metrics";
import {
  DAY_MS,
  REFRESH_OVERLAP_DAYS,
  TRAINER_LOG_WINDOW_DAYS,
  latestLogsBefore,
  mergeLogWindow,
  refreshStart,
  studentsNeedingEarlierLog,
  windowStart,
} from "./readWindows";
import type { Student } from "./students";

const SP = "America/Sao_Paulo";
const TODAY = "2026-10-12";
const NOW = Date.parse(`${TODAY}T15:00:00-03:00`);

function student(id: string, overrides: Partial<Student> = {}): Student {
  return {
    id,
    name: id,
    linked: true,
    goal: "",
    medicalNotes: "",
    trainingDays: ["Segunda", "Quarta", "Sexta"],
    createdAt: NOW - 400 * DAY_MS,
    pendingAssessmentRequest: false,
    paused: false,
    ...overrides,
  };
}

/** One document per exercise, a few milliseconds apart, on each of the given days before NOW. */
function sessions(studentId: string, daysAgo: readonly number[], exercises = 3): WorkoutLogDoc[] {
  return daysAgo.flatMap((ago) =>
    Array.from({ length: exercises }, (_, i) => ({
      id: `${studentId}-${ago}-${i}`,
      trainerId: "t1",
      studentId,
      workoutId: "w1",
      exerciseName: `Exercício ${i}`,
      date: NOW - ago * DAY_MS - 8 * 3_600_000 + i * 4,
      performedSetsJson: "[]",
      note: null,
    })),
  );
}

const everyOtherDay = (until: number) => Array.from({ length: Math.floor(until / 2) }, (_, i) => 1 + i * 2);

describe("windowStart / refreshStart", () => {
  it("counts whole days back from now", () => {
    expect(windowStart(NOW, TRAINER_LOG_WINDOW_DAYS)).toBe(NOW - 63 * DAY_MS);
  });

  it("re-reads the overlap before the previous load, never before the window", () => {
    const from = windowStart(NOW, 63);
    expect(refreshStart(NOW - 60_000, NOW, from)).toBe(NOW - 60_000 - REFRESH_OVERLAP_DAYS * DAY_MS);
    expect(refreshStart(NOW - 100 * DAY_MS, NOW, from)).toBe(from);
    // A clock that went backwards still re-reads from now, not from the future.
    expect(refreshStart(NOW + DAY_MS, NOW, from)).toBe(NOW - REFRESH_OVERLAP_DAYS * DAY_MS);
  });
});

describe("mergeLogWindow", () => {
  const from = windowStart(NOW, 63);
  const cached = [...sessions("a", [70, 40, 10, 2]), ...sessions("b", [5])];

  it("keeps the older cached logs, takes the refreshed span as read, and drops what left the window", () => {
    const refetchedFrom = NOW - 8 * DAY_MS;
    const refetched = [...sessions("a", [2]).slice(0, 1), ...sessions("c", [1])]; // a's day-2 session corrected to one exercise, b's day-5 session deleted, c new
    const merged = mergeLogWindow(cached, refetched, refetchedFrom, from);
    expect(merged.filter((log) => log.studentId === "a").map((log) => log.id).sort()).toEqual(
      ["a-10-0", "a-10-1", "a-10-2", "a-2-0", "a-40-0", "a-40-1", "a-40-2"].sort(),
    );
    expect(merged.some((log) => log.studentId === "b")).toBe(false);
    expect(merged.filter((log) => log.studentId === "c")).toHaveLength(3);
    expect(merged.every((log) => log.date >= from)).toBe(true);
  });
});

describe("studentsNeedingEarlierLog", () => {
  const from = windowStart(NOW, 63);
  const students = [
    student("recent"),
    student("quiet"),
    student("never"),
    student("paused", { paused: true }),
    student("draft", { linked: false }),
    student("joinedInsideWindow", { createdAt: NOW - 10 * DAY_MS }),
  ];
  const logs = [...sessions("recent", [3]), ...sessions("quiet", [120, 90])];

  it("asks only for linked, active alunos who joined before the window and have nothing inside it", () => {
    expect(studentsNeedingEarlierLog(students, logs, from).sort()).toEqual(["never", "quiet"]);
  });

  it("finds each one's latest older log", () => {
    const earlier = latestLogsBefore(logs, ["quiet", "never"], from);
    expect(earlier.map((log) => log.id)).toEqual(["quiet-90-2"]);
  });
});

describe("the windowed load gives the dashboard exactly the figures of the full history", () => {
  const students = [
    student("busy"),
    student("quietForLong"),
    student("quietRecently"),
    student("never"),
    student("paused", { paused: true }),
    student("draft", { linked: false }),
    student("joinedLastWeek", { createdAt: NOW - 5 * DAY_MS }),
    student("pendingAssessment", { pendingAssessmentRequest: true }),
  ];
  const all = [
    ...sessions("busy", everyOtherDay(300), 6),
    ...sessions("quietForLong", [200, 150, 100]),
    ...sessions("quietRecently", [30, 20, 12]),
    ...sessions("paused", [200, 3]),
    ...sessions("joinedLastWeek", [1]),
    ...sessions("pendingAssessment", [62, 64, 66]),
  ];

  it("for sessions, adherence, quiet (with their last day) and pending assessments", () => {
    const from = windowStart(NOW, TRAINER_LOG_WINDOW_DAYS);
    const logs = all.filter((log) => log.date >= from);
    const earlierLogs = latestLogsBefore(all, studentsNeedingEarlierLog(students, logs, from), from);
    expect(logs.length).toBeLessThan(all.length / 3);
    const full = dashboardFigures({ students, logs: all, payments: [] }, TODAY, SP);
    const windowed = dashboardFigures({ students, logs, earlierLogs, payments: [] }, TODAY, SP);
    expect(windowed).toEqual(full);
    expect(windowed.quiet.map((q) => [q.student.id, q.lastTrained])).toEqual([
      ["never", null],
      ["quietForLong", "2026-07-04"],
      ["pendingAssessment", "2026-08-11"],
      ["quietRecently", "2026-09-30"],
    ]);
  });
});
