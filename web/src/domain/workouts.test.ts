import { describe, expect, it } from "vitest";
import type { Exercise } from "./exercise";
import { applyPaste, manualExercise, withDerivedStatus, workoutErrors, type Workout } from "./workouts";

const ficha: Workout = {
  id: "w1",
  trainerId: "trainerA",
  studentId: "studentA",
  name: "Ficha A",
  isActive: true,
  exercises: [],
  createdAt: 1,
  status: "draft",
  assignedAt: null,
  ficha: null,
};

const supino: Exercise = {
  name: "Supino",
  sets: 3,
  reps: "12",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: null,
};

describe("withDerivedStatus — SqlDelightTrainerRepository's rule", () => {
  it("assigns an active ficha and records when", () => {
    expect(withDerivedStatus(ficha, 50)).toEqual({ ...ficha, status: "assigned", assignedAt: 50 });
  });

  it("keeps the first assignment time on later saves", () => {
    expect(withDerivedStatus({ ...ficha, status: "assigned", assignedAt: 10 }, 50).assignedAt).toBe(10);
  });

  it("turns an inactive ficha back into a draft; activating it again records a new time", () => {
    const off = withDerivedStatus({ ...ficha, isActive: false, status: "assigned", assignedAt: 10 }, 50);
    expect(off).toMatchObject({ status: "draft", assignedAt: null });
    expect(withDerivedStatus({ ...off, isActive: true }, 70)).toMatchObject({ status: "assigned", assignedAt: 70 });
  });
});

describe("workoutErrors", () => {
  it("needs a name and at least one exercise", () => {
    expect(workoutErrors("Ficha A", [supino])).toEqual([]);
    expect(workoutErrors(" \t", [])).toEqual(["Nome do treino é obrigatório.", "Adicione pelo menos um exercício."]);
  });
});

describe("applyPaste — both Android screens' Smart Paste handler", () => {
  it("fills a blank name and replaces the exercises", () => {
    expect(applyPaste("Ficha B\nSupino 3x12\nRemada 4x10", { name: "", exercises: [{ ...supino, name: "Old" }] })).toEqual({
      name: "Ficha B",
      exercises: [supino, { ...supino, name: "Remada", sets: 4, reps: "10" }],
    });
  });

  it("never overwrites a name the trainer already typed", () => {
    expect(applyPaste("Ficha B\nSupino 3x12", { name: "Peito", exercises: [] })).toEqual({
      name: "Peito",
      exercises: [supino],
    });
  });

  it("changes nothing when the text has neither", () => {
    const current = { name: "", exercises: [supino] };
    expect(applyPaste("bom treino!", current)).toEqual(current);
  });
});

describe("manualExercise", () => {
  it("builds an exercise from name, sets and reps alone, trimmed", () => {
    expect(manualExercise(" Supino ", " 3 ", " 12 ")).toEqual({ exercise: supino });
  });

  it("rejects a blank name", () => {
    expect(manualExercise("  ", "3", "12")).toEqual({ error: "Nome é obrigatório." });
  });

  it("rejects sets that aren't a positive 32-bit integer — the phone would have stored 0", () => {
    for (const sets of ["", "abc", "0", "-2", "2.5", "99999999999"]) {
      expect(manualExercise("Supino", sets, "12")).toEqual({ error: "Séries precisa ser um número maior que zero." });
    }
  });
});
