import { describe, expect, it } from "vitest";
import type { Assessment } from "./assessments";
import { DAY_MS } from "./readWindows";
import type { WorkoutLogDoc } from "./metrics";
import type { SessionFeedback } from "./sessionFeedback";
import { anamnesisStatus, lastSession } from "./studentSummary";

const NOW = Date.UTC(2026, 9, 15, 15);
const assessment = (id: string, submittedAt: number, anamnesis: boolean): Assessment => ({
  id, studentId: "s1", trainerId: "t1", submittedAt, parQAnswers: {}, goal: "", experienceLevel: "", trainingDays: [],
  anamnesis: anamnesis ? { version: 1, answers: {} } : null, consentVersion: anamnesis ? "anamnese-v1" : null, consentAt: anamnesis ? submittedAt : null,
});
const log = (date: number): WorkoutLogDoc => ({ id: `l${date}`, trainerId: "t1", studentId: "s1", workoutId: "w1", exerciseName: "Supino", date, performedSetsJson: "[]", note: null });
const feedback = (day: string, effort: number | null, pain: boolean): SessionFeedback => ({
  studentId: "s1", trainerId: "t1", day, effort, pain, studentComment: "", studentAt: 1, studentSeenAt: null, trainerComment: "", trainerAt: null, trainerSeenAt: null,
});

describe("anamnesisStatus", () => {
  it("is pending while a request is open, whatever was sent before", () => {
    expect(anamnesisStatus([assessment("a", NOW - DAY_MS, true)], true, NOW).kind).toBe("pending");
  });
  it("is never when only plain self-assessments or nothing was sent", () => {
    expect(anamnesisStatus([], false, NOW)).toEqual({ kind: "never", label: "nunca enviada" });
    expect(anamnesisStatus([assessment("a", NOW - DAY_MS, false)], false, NOW).kind).toBe("never");
  });
  it("is current within six months and outdated after, by the newest anamnese", () => {
    expect(anamnesisStatus([assessment("a", NOW - 10 * DAY_MS, true)], false, NOW).kind).toBe("current");
    expect(anamnesisStatus([assessment("a", NOW - 200 * DAY_MS, true)], false, NOW).kind).toBe("outdated");
    expect(anamnesisStatus([assessment("a", NOW - 200 * DAY_MS, true), assessment("b", NOW - 5 * DAY_MS, true)], false, NOW).kind).toBe("current");
  });
});

describe("lastSession", () => {
  const tz = "America/Sao_Paulo";
  const dayOf = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
  const monday = Date.UTC(2026, 9, 12, 15); // 12:00 in São Paulo
  it("gives the newest session with its effort word and pain", () => {
    const result = lastSession([log(monday - 3 * DAY_MS), log(monday)], [feedback("2026-10-12", 8, true), feedback("2026-10-09", 2, false)], null, tz, dayOf);
    expect(result).toEqual({ day: "2026-10-12", effort: "Pesado", pain: true });
  });
  it("has no effort when the aluno said nothing", () => {
    expect(lastSession([log(monday)], [], null, tz, dayOf)).toEqual({ day: "2026-10-12", effort: null, pain: false });
  });
  it("falls back to the log before the window, and to nothing", () => {
    expect(lastSession([], [], log(monday - 90 * DAY_MS), tz, dayOf)?.day).toBe("2026-07-14");
    expect(lastSession([], [], null, tz, dayOf)).toBeNull();
  });
});
