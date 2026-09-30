import { describe, expect, it } from "vitest";
import type { Assessment } from "../../../domain/assessments";
import type { Biometric } from "../../../domain/biometrics";
import type { WorkoutLogDoc } from "../../../domain/metrics";
import { buildLedger } from "./ledger";

const ZONE = "America/Sao_Paulo";
// 07:00 in São Paulo (UTC-3) on the given day, plus `minutes`.
const at = (day: number, minutes = 0) => Date.UTC(2026, 8, day, 10, minutes);

function log(id: string, studentId: string, date: number, exerciseName: string, sets = "[]"): WorkoutLogDoc {
  return { id, trainerId: "t", studentId, workoutId: "w", exerciseName, date, performedSetsJson: sets, note: null };
}

const sets = (weight: string, reps: number) => JSON.stringify([{ setNumber: 1, weight, reps }]);

describe("buildLedger", () => {
  it("folds one student's per-exercise logs of a day into one session, in the order performed", () => {
    const days = buildLedger({
      logs: [
        log("3", "ana", at(25, 30), "Remada", sets("12", 10)),
        log("1", "ana", at(25, 0), "Supino", sets("10", 10)),
        log("2", "ana", at(25, 10), "Agachamento", sets("20", 8)),
      ],
      biometrics: [],
      assessments: [],
      timeZone: ZONE,
    });
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-09-25");
    const [session] = days[0].entries;
    expect(session.kind).toBe("session");
    if (session.kind !== "session") return;
    expect(session.exercises.map((e) => e.name)).toEqual(["Supino", "Agachamento", "Remada"]);
    expect(session.exercises[0].sets).toBe("10x10");
  });

  it("keeps two students on the same day, and one student on two days, apart", () => {
    const days = buildLedger({
      logs: [log("1", "ana", at(25), "A"), log("2", "bruno", at(25, 5), "B"), log("3", "ana", at(24), "C")],
      biometrics: [],
      assessments: [],
      timeZone: ZONE,
    });
    expect(days.map((d) => d.date)).toEqual(["2026-09-25", "2026-09-24"]);
    expect(days[0].entries).toHaveLength(2);
  });

  it("uses the trainer's local day, not UTC's", () => {
    // 01:30 UTC on the 26th is 22:30 on the 25th in São Paulo.
    const days = buildLedger({
      logs: [log("1", "ana", Date.UTC(2026, 8, 26, 1, 30), "A")],
      biometrics: [],
      assessments: [],
      timeZone: ZONE,
    });
    expect(days[0].date).toBe("2026-09-25");
  });

  it("puts measurements and self-assessments on their own days, newest day first", () => {
    const measurement: Biometric = { id: "m1", trainerId: "t", studentId: "ana", weight: 64.2, height: 0, bodyFat: 0, date: at(20) };
    const assessment: Assessment = {
      id: "a1",
      studentId: "ana",
      trainerId: "t",
      submittedAt: at(26),
      parQAnswers: { heart_condition: true, chest_pain: false },
      goal: "",
      experienceLevel: "",
      trainingDays: [],
    };
    const days = buildLedger({ logs: [log("1", "ana", at(25), "A")], biometrics: [measurement], assessments: [assessment], timeZone: ZONE });
    expect(days.map((d) => d.date)).toEqual(["2026-09-26", "2026-09-25", "2026-09-20"]);
    const flagged = days[0].entries[0];
    expect(flagged.kind === "assessment" && flagged.flagged).toBe(1);
  });

  it("can be narrowed to one student", () => {
    const days = buildLedger({
      logs: [log("1", "ana", at(25), "A"), log("2", "bruno", at(25), "B")],
      biometrics: [],
      assessments: [],
      timeZone: ZONE,
      studentId: "bruno",
    });
    expect(days).toHaveLength(1);
    expect(days[0].entries.map((e) => e.studentId)).toEqual(["bruno"]);
  });
});
