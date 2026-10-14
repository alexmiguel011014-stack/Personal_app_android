import { describe, expect, it } from "vitest";
import type { PerformedSet } from "./exercise";
import type { WorkoutLogDoc } from "./metrics";
import { MAX_EXTRA_ROWS, MAX_PLANNED_ROWS, initialRows, rowsFromSets } from "./sessionLog";
import { EDIT_WINDOW_DAYS, groupSessions, isEditableSession } from "./sessions";

// GOALS.md §38c (U7, D12): correcting or deleting a session the aluno logged.

const set = (setNumber: number, weight: string, reps: number): PerformedSet => ({ setNumber, weight, reps });

describe("rowsFromSets — a logged exercise back into the form's rows", () => {
  it("puts each set in its own row, keeping a gap where a row was skipped", () => {
    const rows = rowsFromSets([set(1, "20", 12), set(3, "22,5", 10)], 3);
    expect(rows).toEqual([
      { weight: "20", reps: "12" },
      { weight: "", reps: "" },
      { weight: "22,5", reps: "10" },
    ]);
  });

  it("has at least the prescribed rows, blank after the last set", () => {
    expect(rowsFromSets([set(1, "20", 12)], 4)).toHaveLength(4);
    expect(rowsFromSets([], 3)).toEqual(initialRows(3));
  });

  it("keeps the extra sets the student had added, up to the sanity limits", () => {
    const rows = rowsFromSets([set(1, "20", 12), set(5, "10", 8)], 3);
    expect(rows).toHaveLength(5);
    expect(rows[4]).toEqual({ weight: "10", reps: "8" });
    expect(rowsFromSets([set(999, "1", 1)], 3)).toHaveLength(MAX_PLANNED_ROWS + MAX_EXTRA_ROWS);
  });

  it("ignores a set whose number is not a row (zero, negative)", () => {
    expect(rowsFromSets([set(0, "9", 9), set(-2, "9", 9)], 2)).toEqual(initialRows(2));
  });
});

describe("isEditableSession — the last seven days, today included", () => {
  it("is true for today and the six days before, false from the seventh day back and for the future", () => {
    expect(EDIT_WINDOW_DAYS).toBe(7);
    expect(isEditableSession("2026-10-13", "2026-10-13")).toBe(true);
    expect(isEditableSession("2026-10-07", "2026-10-13")).toBe(true);
    expect(isEditableSession("2026-10-06", "2026-10-13")).toBe(false);
    expect(isEditableSession("2026-10-14", "2026-10-13")).toBe(false);
  });

  it("works across a month boundary", () => {
    expect(isEditableSession("2026-09-30", "2026-10-02")).toBe(true);
    expect(isEditableSession("2026-09-25", "2026-10-02")).toBe(false);
  });
});

describe("a session knows the documents behind it", () => {
  it("carries its logs, in the order performed, so a correction or deletion acts on exactly those", () => {
    const log = (id: string, date: number, exerciseName: string): WorkoutLogDoc => ({ id, trainerId: "t", studentId: "ana", workoutId: "w1", exerciseName, date, performedSetsJson: "[]", note: null });
    const base = Date.UTC(2026, 9, 12, 10, 0);
    const [session] = groupSessions([log("c", base + 20, "Remada"), log("a", base, "Supino"), log("b", base + 10, "Agachamento")], "America/Sao_Paulo");
    expect(session.logs.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });
});
