import { describe, expect, it } from "vitest";
import {
  ABC_ANNOTATED,
  ABC_PLAIN,
  CHATTER_AND_EMPTY,
  DIA_1_A_3,
  EXERCISES_BEFORE_HEADER,
  MARKDOWN_HEAVY,
  REPEATED_LETTER,
  SINGLE,
  SPREADSHEET,
} from "./__fixtures__/multiFicha";
import { parseExercises, parseWorkouts } from "./workoutParser";
import { applyPaste } from "./workouts";

// GOALS.md §25d — splitting one pasted answer into several treinos. The single-ficha functions
// (parseWorkoutName / parseExercises / applyPaste) mirror WorkoutParser.kt and are NOT changed; this
// file only adds. The first test pins the reason the feature exists.

const names = (text: string) => parseWorkouts(text).workouts.map((w) => w.name);
const counts = (text: string) => parseWorkouts(text).workouts.map((w) => w.exercises.length);

describe("why parseWorkouts exists", () => {
  it("applyPaste (the phone's rule) puts every treino's exercises into ONE ficha", () => {
    const pasted = applyPaste(ABC_PLAIN, { name: "", exercises: [] });
    expect(pasted.name).toBe("Ficha A");
    expect(pasted.exercises).toHaveLength(9); // A + B + C piled together
  });
});

describe("parseWorkouts — splitting", () => {
  it("splits a realistic ABC answer inside a code fence, with annotations", () => {
    const { workouts, warnings } = parseWorkouts(ABC_ANNOTATED);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e tríceps", "Treino B — Costas e bíceps", "Treino C — Pernas"]);
    expect(workouts.map((w) => w.exercises.length)).toEqual([3, 3, 3]);
    expect(workouts[0].exercises[0]).toMatchObject({ name: "Supino reto", sets: 4, reps: "10" });
    expect(workouts[0].exercises[0].muscleActivation).toEqual({ Peitoral: 1, "Delt. ant.": 0.5, "Tríceps geral": 0.5 });
    expect(warnings).toEqual([]);
  });

  it("splits the same plan without annotations", () => {
    expect(names(ABC_PLAIN)).toEqual(["Ficha A", "Ficha B", "Ficha C"]);
    expect(counts(ABC_PLAIN)).toEqual([3, 3, 3]);
    expect(parseWorkouts(ABC_PLAIN).workouts[1].exercises[0].muscleActivation).toBeNull();
  });

  it("copes with markdown the prompt asked the AI not to use (headings, bold, bullets, numbering)", () => {
    const { workouts } = parseWorkouts(MARKDOWN_HEAVY);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e Tríceps", "Treino B — Costas e Bíceps", "Treino C — Pernas"]);
    expect(workouts.map((w) => w.exercises.map((e) => e.name))).toEqual([
      ["Supino reto", "Supino inclinado", "Tríceps pushdown"],
      ["Puxada/barra fixa pronada", "Rosca martelo"],
      ["Agachamento profundo", "Stiff"],
    ]);
    expect(workouts[1].exercises[0]).toMatchObject({ sets: 4, reps: "10-12" });
  });

  it("reads Dia 1, Dia 2, Dia 3", () => {
    expect(names(DIA_1_A_3)).toEqual(["Dia 1", "Dia 2", "Dia 3"]);
    expect(counts(DIA_1_A_3)).toEqual([2, 2, 2]);
  });

  it("ignores chatter before, between and after, and drops a treino that came out empty (with a warning)", () => {
    const { workouts, warnings } = parseWorkouts(CHATTER_AND_EMPTY);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A", "Treino C"]);
    expect(warnings).toEqual(["Treino B não tem exercícios e foi ignorado."]);
  });

  it("keeps a repeated header letter as a second treino", () => {
    expect(names(REPEATED_LETTER)).toEqual(["Treino A", "Treino A (2)"]);
  });

  it("puts exercises that come before any header in 'Treino 1' and says so", () => {
    const { workouts, warnings } = parseWorkouts(EXERCISES_BEFORE_HEADER);
    expect(workouts.map((w) => w.name)).toEqual(["Treino 1", "Treino B"]);
    expect(warnings).toEqual(["Havia exercícios antes do primeiro título; ficaram em “Treino 1”."]);
  });

  it("treats a header line that carries an NxM as an exercise, not a header", () => {
    const { workouts } = parseWorkouts("Treino A\nSupino 3x10\nDia 1 3x10");
    expect(workouts).toHaveLength(1);
    expect(workouts[0].exercises.map((e) => e.name)).toEqual(["Supino", "Dia 1"]);
  });

  it("does not mistake a word that merely starts with a letter for a header (Treino Abdominal)", () => {
    expect(names("Treino Abdominal\nPrancha 3x30")).toEqual(["Treino 1"]);
  });

  it("returns no treinos for text with no exercises", () => {
    expect(parseWorkouts("Só conversa, sem treino.")).toEqual({ workouts: [], warnings: [] });
  });

  it("warns when there are suspiciously many treinos", () => {
    const text = Array.from({ length: 8 }, (_, i) => `Dia ${i < 7 ? i + 1 : 1}\nSupino 3x10`).join("\n");
    expect(parseWorkouts(text).warnings.some((w) => w.includes("8 treinos"))).toBe(true);
  });
});

describe("parseWorkouts — a spreadsheet paste", () => {
  it("groups tab-separated rows by their first column", () => {
    const { workouts } = parseWorkouts(SPREADSHEET);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A", "Treino B", "Treino C"]);
    expect(workouts.map((w) => w.exercises.length)).toEqual([2, 2, 1]);
    expect(workouts[1].exercises[0]).toMatchObject({ name: "Puxada pronada", sets: 4, reps: "10-12" });
  });

  it("is not triggered by ordinary text that happens to contain a tab", () => {
    expect(names("Treino A\nSupino\t3x12")).toEqual(["Treino A"]);
  });
});

describe("parseWorkouts — never loses or invents a line", () => {
  // The splitter must account for exactly the exercises the single-ficha parser finds in text with
  // no decoration; headers and chatter never become exercises, exercises never go missing.
  for (const [label, text] of [
    ["ABC annotated", ABC_ANNOTATED],
    ["ABC plain", ABC_PLAIN],
    ["Dia 1-3", DIA_1_A_3],
    ["chatter", CHATTER_AND_EMPTY],
    ["repeated", REPEATED_LETTER],
    ["before header", EXERCISES_BEFORE_HEADER],
    ["single", SINGLE],
  ] as const) {
    it(`${label}: the exercises of every treino, in order, equal parseExercises(text)`, () => {
      const flat = parseWorkouts(text).workouts.flatMap((w) => w.exercises);
      expect(flat).toEqual(parseExercises(text));
    });
  }
});

describe("parseWorkouts — one treino", () => {
  it("a single header gives one treino named like parseWorkoutName", () => {
    const { workouts } = parseWorkouts(SINGLE);
    expect(workouts).toHaveLength(1);
    expect(workouts[0].name).toBe("Ficha A");
    expect(workouts[0].exercises.map((e) => e.name)).toEqual(["Supino", "Agachamento"]);
  });

  it("text with no header at all is one treino holding every exercise", () => {
    const { workouts } = parseWorkouts("Supino 3x12\nAgachamento 4x10");
    expect(workouts).toHaveLength(1);
    expect(workouts[0].exercises).toHaveLength(2);
  });
});
