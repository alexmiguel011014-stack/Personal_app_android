import { describe, expect, it } from "vitest";
import { initialRows, isCompleteRow, normalizeWeight, performedSets, sessionEntries } from "./sessionLog";

describe("normalizeWeight", () => {
  it("turns a plain comma decimal into the dot the phone's chart can read", () => {
    expect(normalizeWeight(" 22,5 ")).toBe("22.5");
  });

  it("leaves everything else as typed — free text, as on the phone", () => {
    for (const weight of ["20", "22.5", "20kg", "livre", "1,234,5", "2,5kg"]) expect(normalizeWeight(weight)).toBe(weight);
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
  it("starts at the ficha's target set count, from one to ten rows", () => {
    expect(initialRows(3)).toHaveLength(3);
    expect(initialRows(0)).toHaveLength(1);
    expect(initialRows(40)).toHaveLength(10);
    expect(initialRows(2)[0]).toEqual({ weight: "", reps: "" });
  });
});
