import { describe, expect, it } from "vitest";
import { calculateEffectiveVolume, parseExercises, parseWorkoutName } from "./workoutParser";

// Ported one for one from shared/src/commonTest/.../util/WorkoutParserTest.kt — the specification.
describe("WorkoutParserTest.kt, ported", () => {
  it("parseWorkoutName finds Ficha pattern", () => {
    expect(parseWorkoutName("Ficha A\nSupino 3x12")).toBe("Ficha A");
  });

  it("parseWorkoutName finds Treino pattern case-insensitively", () => {
    expect(parseWorkoutName("treino b\nAgachamento 4x10")).toBe("treino b");
  });

  it("parseWorkoutName finds Dia pattern with a digit", () => {
    expect(parseWorkoutName("Dia 1\nRosca 3x12")).toBe("Dia 1");
  });

  it("parseWorkoutName returns null when no pattern matches", () => {
    expect(parseWorkoutName("Supino 3x12\nAgachamento 4x10")).toBeNull();
  });

  it("parseExercises reads sets-then-reps when first number is smaller", () => {
    const exercises = parseExercises("Supino 3x12");
    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({ name: "Supino", sets: 3, reps: "12" });
  });

  it("parseExercises swaps sets and reps when written reps-first", () => {
    // "Biceps 12x4": the smaller number (4) is the set count — the documented heuristic.
    const exercises = parseExercises("Biceps 12x4");
    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({ name: "Biceps", sets: 4, reps: "12" });
  });

  it("parseExercises handles a rep range and spaced x", () => {
    const exercises = parseExercises("Agachamento 4 x 10-12");
    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({ name: "Agachamento", sets: 4, reps: "10-12" });
  });

  it("parseExercises parses multiple lines and skips blank and non-matching lines", () => {
    const text = "Ficha A\n\nSupino 3x12\nobservação: descansar 60s\nAgachamento 4x10";
    expect(parseExercises(text).map((e) => e.name)).toEqual(["Supino", "Agachamento"]);
  });

  it("parseExercises returns empty list for text with no exercise patterns", () => {
    expect(parseExercises("Apenas um texto qualquer")).toEqual([]);
  });

  it("parseExercises parses a trailing muscle-activation annotation", () => {
    const exercises = parseExercises("Supino reto 4x10 [Peitoral:1.0, Deltoide ant:0.5]");
    expect(exercises).toHaveLength(1);
    expect(exercises[0].muscleActivation).toEqual({ Peitoral: 1.0, "Deltoide ant": 0.5 });
  });

  it("parseExercises requires a period decimal in the annotation, not a comma", () => {
    // A comma is ambiguous with the muscle-list separator ("[Costas:0,75]" would read as two
    // entries) — treated as malformed, not parsed.
    expect(parseExercises("Remada 3x10 [Costas:0.75]")[0].muscleActivation).toEqual({ Costas: 0.75 });
  });

  it("rejects legacy activation coefficients outside 0..1, including an overflowing exponent", () => {
    const exercise = parseExercises("Supino 3x10 [Negativo:-0.1, Alto:1.1, Overflow:1e999, Válido:0.75]")[0];
    expect(exercise.muscleActivation).toEqual({ Válido: 0.75 });
    expect(parseExercises("Supino 3x10 [Negativo:-0.1, Alto:1.1, Overflow:1e999]")[0].muscleActivation).toBeNull();
  });

  it("parseExercises leaves muscleActivation null when no annotation is present", () => {
    expect(parseExercises("Supino 3x12")[0].muscleActivation).toBeNull();
  });

  it("parseExercises ignores a malformed annotation instead of crashing", () => {
    const exercises = parseExercises("Supino 3x12 [not valid]");
    expect(exercises).toHaveLength(1);
    expect(exercises[0].muscleActivation).toBeNull();
  });

  it("calculateEffectiveVolume sums fractional contributions across exercises", () => {
    const exercises = parseExercises(
      "Supino reto 4x10 [Peitoral:1.0, Triceps:0.5]\n" +
        "Puxada frontal 3x12 [Costas:1.0, Biceps:0.5]\n" +
        "Triceps corda 3x15 [Triceps:1.0]",
    );
    const volume = calculateEffectiveVolume(exercises);
    expect(volume.Peitoral).toBe(4.0);
    expect(volume.Costas).toBe(3.0);
    expect(volume.Biceps).toBe(1.5);
    // 4 sets × 0.5 (Supino) + 3 sets × 1.0 (Triceps corda)
    expect(volume.Triceps).toBe(5.0);
  });

  it("calculateEffectiveVolume returns an empty map when no exercise has annotations", () => {
    expect(calculateEffectiveVolume(parseExercises("Supino 3x12\nAgachamento 4x10"))).toEqual({});
  });
});

// Where JavaScript's built-ins would quietly disagree with the phone.
describe("parity with the phone on real pasted text", () => {
  it("skips a line joined by a no-break space, as the phone does (Java's \\s is ASCII-only)", () => {
    // WhatsApp sometimes copies spaces as U+00A0. The phone skips this line; so must the web —
    // normalising it would have to happen on both sides at once.
    expect(parseExercises("Supino 3x12")).toEqual([]);
    expect(parseExercises("Supino 3x12")).toHaveLength(1);
  });

  it("keeps a byte-order mark in the name, as the phone does (Kotlin's trim leaves U+FEFF)", () => {
    expect(parseExercises("﻿Supino 3x12")[0].name).toBe("﻿Supino");
  });

  it("reads numbers past 32 bits as 0, as Kotlin's toIntOrNull does", () => {
    // Unbounded, this would be a ficha with three billion sets.
    expect(parseExercises("Supino 3000000000x4000000000")).toEqual([]);
  });

  it("rejects NaN/Infinity coefficients — the one deliberate difference", () => {
    // Kotlin would accept them and then fail to serialise the ficha (kotlinx refuses NaN).
    expect(parseExercises("Supino 3x12 [Peitoral:NaN, Triceps:0.5]")[0].muscleActivation).toEqual({
      Triceps: 0.5,
    });
  });

  it("keeps a muscle named __proto__ as a plain key", () => {
    const activation = parseExercises("Supino 3x12 [__proto__:1.0]")[0].muscleActivation;
    expect(activation && Object.hasOwn(activation, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(activation)).toBe(Object.prototype);
  });
});
