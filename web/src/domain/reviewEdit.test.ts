import { describe, expect, it } from "vitest";
import type { Exercise } from "./exercise";
import { exerciseErrors, parseSetsText, renamedExercise, tidied } from "./reviewEdit";

const supino: Exercise = {
  name: "Supino reto",
  sets: 4,
  reps: "10",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: { Peitoral: 1, "Delt. ant.": 0.5 },
};

describe("parseSetsText", () => {
  it("accepts whole numbers from 1 to 99", () => {
    expect(parseSetsText("4")).toBe(4);
    expect(parseSetsText(" 12 ")).toBe(12);
    expect(parseSetsText("99")).toBe(99);
  });

  it("rejects empty, zero, negative, decimal, huge and non-numeric text", () => {
    for (const text of ["", " ", "0", "-3", "2.5", "2,5", "100", "abc", "4x", "٣"]) {
      expect(parseSetsText(text)).toBeNull();
    }
  });
});

describe("renamedExercise", () => {
  it("drops the muscle activation when the exercise changes — it belonged to the old one", () => {
    const next = renamedExercise(supino, "Supino inclinado");
    expect(next.name).toBe("Supino inclinado");
    expect(next.muscleActivation).toBeNull();
    expect(next).toMatchObject({ sets: 4, reps: "10" });
  });

  it("keeps it when only whitespace changes", () => {
    expect(renamedExercise(supino, "  Supino reto ").muscleActivation).toEqual(supino.muscleActivation);
  });

  it("does not mutate the original", () => {
    renamedExercise(supino, "Outro");
    expect(supino.muscleActivation).not.toBeNull();
  });
});

describe("exerciseErrors and tidied", () => {
  it("names the exercises left without a name", () => {
    expect(exerciseErrors([supino, { ...supino, name: "   " }, { ...supino, name: "" }])).toEqual([
      "o exercício 2 está sem nome",
      "o exercício 3 está sem nome",
    ]);
    expect(exerciseErrors([supino])).toEqual([]);
  });

  it("trims names and reps for storage and leaves the rest alone", () => {
    expect(tidied([{ ...supino, name: "  Supino reto ", reps: " 10-12 " }])).toEqual([
      { ...supino, name: "Supino reto", reps: "10-12" },
    ]);
  });
});
