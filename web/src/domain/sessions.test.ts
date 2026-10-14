import { describe, expect, it } from "vitest";
import type { WorkoutLogDoc } from "./metrics";
import { groupSessions, sessionTitle } from "./sessions";

const ZONE = "America/Sao_Paulo";
// 07:00 in São Paulo (UTC-3) on the given September day, plus `minutes`.
const at = (day: number, minutes = 0) => Date.UTC(2026, 8, day, 10, minutes);
const sets = (weight: string, reps: number) => JSON.stringify([{ setNumber: 1, weight, reps }]);

function log(id: string, studentId: string, date: number, exerciseName: string, workoutId = "w1", performed = "[]", note: string | null = null): WorkoutLogDoc {
  return { id, trainerId: "t", studentId, workoutId, exerciseName, date, performedSetsJson: performed, note };
}

describe("groupSessions", () => {
  it("folds one student's per-exercise logs of a day into one session, in the order performed", () => {
    const sessions = groupSessions(
      [log("3", "ana", at(25, 30), "Remada", "w1", sets("12", 10)), log("1", "ana", at(25), "Supino", "w1", sets("10", 10)), log("2", "ana", at(25, 10), "Agachamento")],
      ZONE,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].key).toBe("ana|2026-09-25");
    expect(sessions[0].exercises.map((e) => e.name)).toEqual(["Supino", "Agachamento", "Remada"]);
    expect(sessions[0].exercises[0].sets).toBe("10x10");
    expect(sessions[0].exercises[1].sets).toBe("");
    expect(sessions[0].ms).toBe(at(25, 30));
  });

  it("keeps two students on the same day, and one student on two days, apart — newest first", () => {
    const sessions = groupSessions([log("1", "ana", at(25), "A"), log("2", "bruno", at(25, 5), "B"), log("3", "ana", at(24), "C")], ZONE);
    expect(sessions.map((s) => s.key)).toEqual(["bruno|2026-09-25", "ana|2026-09-25", "ana|2026-09-24"]);
  });

  it("can be limited to one student", () => {
    const sessions = groupSessions([log("1", "ana", at(25), "A"), log("2", "bruno", at(25), "B")], ZONE, "bruno");
    expect(sessions.map((s) => s.studentId)).toEqual(["bruno"]);
  });

  it("cuts the day where the student's clock does: 23:30 in São Paulo is already tomorrow in UTC", () => {
    const lateNight = Date.UTC(2026, 8, 26, 2, 30); // 23:30 on the 25th in São Paulo
    const next = Date.UTC(2026, 8, 26, 10, 0); // 07:00 on the 26th
    const sessions = groupSessions([log("1", "ana", lateNight, "A"), log("2", "ana", next, "B")], ZONE);
    expect(sessions.map((s) => s.day).sort()).toEqual(["2026-09-25", "2026-09-26"]);
  });

  it("lists the treinos in the order first performed, without repeating one, and carries the notes", () => {
    const [session] = groupSessions([log("1", "ana", at(25), "A", "wB", "[]", "  "), log("2", "ana", at(25, 5), "B", "wA", "[]", "doeu o ombro"), log("3", "ana", at(25, 9), "C", "wB")], ZONE);
    expect(session.workoutIds).toEqual(["wB", "wA"]);
    expect(session.exercises.map((e) => e.note)).toEqual([null, "doeu o ombro", null]);
  });

  it("gives nothing for no logs", () => {
    expect(groupSessions([], ZONE)).toEqual([]);
  });
});

describe("sessionTitle", () => {
  const names = new Map([
    ["wA", "Treino A — Peito"],
    ["wB", "Treino B — Costas"],
  ]);

  it("names the treino, or both when two were done the same day", () => {
    expect(sessionTitle({ workoutIds: ["wA"] }, names)).toBe("Treino A — Peito");
    expect(sessionTitle({ workoutIds: ["wA", "wB"] }, names)).toBe("Treino A — Peito + Treino B — Costas");
  });

  it("says 'Treino removido' when the treino is gone — and names the ones that are not", () => {
    expect(sessionTitle({ workoutIds: ["gone"] }, names)).toBe("Treino removido");
    expect(sessionTitle({ workoutIds: [] }, names)).toBe("Treino removido");
    expect(sessionTitle({ workoutIds: ["gone", "wB"] }, names)).toBe("Treino B — Costas");
    expect(sessionTitle({ workoutIds: ["wA"] }, new Map([["wA", "  "]]))).toBe("Treino removido");
  });
});
