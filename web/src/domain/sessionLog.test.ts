import { describe, expect, it } from "vitest";
import {
  MAX_EXTRA_ROWS,
  canAddExtraRow,
  initialRows,
  isCompleteRow,
  isExtraRow,
  normalizeWeight,
  performedSets,
  plannedRowCount,
  sessionEntries,
} from "./sessionLog";

describe("normalizeWeight", () => {
  it("turns a plain comma decimal into the dot the phone's chart can read", () => {
    expect(normalizeWeight(" 22,5 ")).toBe("22.5");
  });

  it("leaves everything else as typed — free text, as on the phone", () => {
    for (const weight of ["20", "22.5", "20kg", "livre", "1,234,5", "2,5kg"])
      expect(normalizeWeight(weight)).toBe(weight);
  });
});

describe("isCompleteRow — StudentLogSessionScreen's rule", () => {
  it("needs a weight and whole reps above zero", () => {
    expect(isCompleteRow({ weight: "20", reps: "12" })).toBe(true);
    expect(isCompleteRow({ weight: "livre", reps: " 8 " })).toBe(true);
    for (const row of [
      { weight: " ", reps: "12" },
      { weight: "20", reps: "" },
      { weight: "20", reps: "doze" },
      { weight: "20", reps: "8.5" },
      { weight: "20", reps: "0" },
    ]) {
      expect(isCompleteRow(row)).toBe(false);
    }
  });
});

describe("performedSets", () => {
  it("numbers sets by their row, so a skipped row leaves a gap as on the phone", () => {
    expect(
      performedSets([
        { weight: "20", reps: "12" },
        { weight: "", reps: "" },
        { weight: "22,5", reps: "10" },
      ]),
    ).toEqual([
      { setNumber: 1, weight: "20", reps: 12 },
      { setNumber: 3, weight: "22.5", reps: 10 },
    ]);
  });
});

describe("sessionEntries", () => {
  it("keeps the exercises with at least one complete row, in the ficha's order", () => {
    const rows = new Map([
      ["Supino", [{ weight: "20", reps: "12" }]],
      ["Remada", [{ weight: "", reps: "" }]],
      ["Agachamento", [{ weight: "40", reps: "10" }]],
    ]);
    expect(sessionEntries(rows).map(([name]) => name)).toEqual(["Supino", "Agachamento"]);
  });
});

describe("initialRows", () => {
  it("starts at the ficha's target set count — every prescribed set has its row", () => {
    expect(initialRows(3)).toHaveLength(3);
    expect(initialRows(12)).toHaveLength(12); // no longer capped at ten: the student can't add rows
    expect(initialRows(0)).toHaveLength(1);
    expect(initialRows(2)[0]).toEqual({ weight: "", reps: "" });
  });

  it("stops at a sanity limit of 30", () => {
    expect(initialRows(40)).toHaveLength(30);
    expect(plannedRowCount(40)).toBe(30);
  });
});

// The student may add sets only when the trainer allowed it, may remove only the ones they added, and
// the prescribed ones never go.
describe("extra rows", () => {
  it("tells prescribed rows from the student's own, by position", () => {
    expect(isExtraRow(0, 4)).toBe(false);
    expect(isExtraRow(3, 4)).toBe(false);
    expect(isExtraRow(4, 4)).toBe(true);
    expect(isExtraRow(0, 0)).toBe(false); // a target of 0 still has one prescribed row
    expect(isExtraRow(1, 0)).toBe(true);
  });

  it("allows another row only when permitted and under the limit", () => {
    expect(canAddExtraRow(false, 4, 4)).toBe(false); // the default: no
    expect(canAddExtraRow(true, 4, 4)).toBe(true);
    expect(canAddExtraRow(true, 4 + MAX_EXTRA_ROWS - 1, 4)).toBe(true);
    expect(canAddExtraRow(true, 4 + MAX_EXTRA_ROWS, 4)).toBe(false);
  });
});
