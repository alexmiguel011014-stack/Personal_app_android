import { describe, expect, it } from "vitest";
import {
  LEGACY_FICHA_ID,
  LEGACY_FICHA_NAME,
  MAX_FICHA_NAME_LENGTH,
  fichaNameErrors,
  fichaSaveErrors,
  groupFichas,
  planNewFicha,
} from "./fichas";
import type { Exercise } from "./exercise";
import type { Workout } from "./workouts";

const exercise: Exercise = { name: "Supino", sets: 3, reps: "12", weight: null, restSeconds: null, notes: null, muscleActivation: null };

function treino(id: string, overrides: Partial<Workout> = {}): Workout {
  return {
    id,
    trainerId: "t",
    studentId: "s1",
    name: `Treino ${id}`,
    isActive: true,
    exercises: [exercise],
    createdAt: 100,
    status: "assigned",
    assignedAt: 100,
    ficha: null,
    ...overrides,
  };
}

/** A member of a real ficha. */
function member(id: string, fichaId: string, fichaName: string, createdAt: number, order: number, overrides: Partial<Workout> = {}): Workout {
  return treino(id, { ficha: { id: fichaId, name: fichaName, createdAt, updatedAt: createdAt, order }, createdAt, ...overrides });
}

describe("groupFichas", () => {
  it("no treinos, no fichas", () => {
    expect(groupFichas([])).toEqual([]);
  });

  it("the active treinos that predate fichas are ONE virtual ficha; the inactive ones are hidden", () => {
    const fichas = groupFichas([
      treino("A", { name: "Treino A", createdAt: 30, assignedAt: 31 }),
      treino("B", { name: "Treino B", createdAt: 20, assignedAt: 90 }),
      treino("old", { isActive: false, status: "draft", assignedAt: null, createdAt: 1 }),
      treino("draft", { isActive: false, status: "draft", assignedAt: null, createdAt: 2 }),
    ]);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({ id: LEGACY_FICHA_ID, name: LEGACY_FICHA_NAME, legacy: true, createdAt: 20, updatedAt: 90 });
    // by name, not by createdAt (the newest-first stagger of the old multi-save would reverse them)
    expect(fichas[0].treinos.map((t) => t.id)).toEqual(["A", "B"]);
  });

  it("a real ficha: members share an id, in the saved order; name and dates come from the members", () => {
    const fichas = groupFichas([
      member("c", "f1", "Hipertrofia", 500, 2),
      member("a", "f1", "Hipertrofia", 500, 0),
      member("b", "f1", "Hipertrofia", 500, 1),
    ]);
    expect(fichas).toHaveLength(1);
    expect(fichas[0]).toMatchObject({ id: "f1", name: "Hipertrofia", legacy: false, createdAt: 500, updatedAt: 500 });
    expect(fichas[0].treinos.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("uses the name and the date of the member saved last", () => {
    const old = member("a", "f1", "Nome velho", 500, 0);
    const edited = { ...member("b", "f1", "Nome novo", 500, 1), ficha: { id: "f1", name: "Nome novo", createdAt: 500, updatedAt: 900, order: 1 } };
    const [ficha] = groupFichas([old, edited]);
    expect(ficha).toMatchObject({ name: "Nome novo", createdAt: 500, updatedAt: 900 });
  });

  it("members of a real ficha count whatever their isActive says", () => {
    const [ficha] = groupFichas([member("a", "f1", "X", 500, 0, { isActive: false, status: "draft", assignedAt: null })]);
    expect(ficha.treinos).toHaveLength(1);
  });

  it("real and legacy together: newest first, the id breaks a tie", () => {
    const fichas = groupFichas([
      treino("L", { createdAt: 10 }),
      member("n", "newer", "Nova", 500, 0),
      member("m", "middle", "Meio", 200, 0),
      member("m2", "aaa-tie", "Empate", 200, 0),
    ]);
    expect(fichas.map((f) => f.id)).toEqual(["newer", "aaa-tie", "middle", LEGACY_FICHA_ID]);
  });

  it("a treino whose ficha map was dropped (a phone save) reads as legacy, not as a ficha", () => {
    const fichas = groupFichas([member("a", "f1", "X", 500, 0), treino("phone", { createdAt: 600 })]);
    expect(fichas.map((f) => f.id)).toEqual([LEGACY_FICHA_ID, "f1"]);
  });
});

describe("planNewFicha", () => {
  const incoming = [treino("n1"), treino("n2")];

  it("nothing is deleted with zero or one ficha", () => {
    expect(planNewFicha([], incoming).toDelete).toEqual([]);
    expect(planNewFicha([member("a", "f1", "X", 500, 0)], incoming).toDelete).toEqual([]);
  });

  it("with two fichas it deletes exactly every treino of the older one", () => {
    const existing = [
      member("a1", "old", "Velha", 100, 0),
      member("a2", "old", "Velha", 100, 1),
      member("b1", "new", "Nova", 200, 0),
    ];
    const plan = planNewFicha(existing, incoming);
    expect(plan.toDelete.map((t) => t.id).sort()).toEqual(["a1", "a2"]);
    expect(plan.toCreate.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("with three it deletes the two oldest (keeps only the newest)", () => {
    const existing = [member("a", "f1", "1", 100, 0), member("b", "f2", "2", 200, 0), member("c", "f3", "3", 300, 0)];
    expect(planNewFicha(existing, incoming).toDelete.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("the oldest can be the legacy ficha; hidden legacy treinos are never listed", () => {
    const existing = [
      treino("L1", { createdAt: 10 }),
      treino("L2", { createdAt: 11 }),
      treino("hidden", { isActive: false, status: "draft", assignedAt: null, createdAt: 12 }),
      member("b", "real", "Real", 200, 0),
    ];
    expect(planNewFicha(existing, incoming).toDelete.map((t) => t.id).sort()).toEqual(["L1", "L2"]);
  });

  it("refuses a treino that is both created and deleted", () => {
    const existing = [member("a", "f1", "1", 100, 0), member("b", "f2", "2", 200, 0)];
    expect(() => planNewFicha(existing, [treino("a")])).toThrow(/more than one list/);
  });
});

describe("ficha name and save rules", () => {
  it("the name is required and at most 80 characters after trimming", () => {
    expect(fichaNameErrors("")).toEqual(["Nome da ficha é obrigatório."]);
    expect(fichaNameErrors("  \t ")).toEqual(["Nome da ficha é obrigatório."]);
    expect(fichaNameErrors("a".repeat(MAX_FICHA_NAME_LENGTH))).toEqual([]);
    expect(fichaNameErrors(`  ${"a".repeat(MAX_FICHA_NAME_LENGTH)}  `)).toEqual([]);
    expect(fichaNameErrors("a".repeat(MAX_FICHA_NAME_LENGTH + 1))).toEqual(["Nome da ficha: no máximo 80 caracteres."]);
  });

  it("a ficha needs a name, a treino, and every treino a name and an exercise", () => {
    expect(fichaSaveErrors("Hipertrofia", [{ name: "Treino A", exercises: [exercise] }])).toEqual([]);
    expect(fichaSaveErrors("", [])).toEqual(["Nome da ficha é obrigatório.", "Adicione pelo menos um treino."]);
    expect(fichaSaveErrors("X", [{ name: "", exercises: [] }])).toEqual([
      "Treino sem nome: Nome do treino é obrigatório.",
      "Treino sem nome: Adicione pelo menos um exercício.",
    ]);
    expect(fichaSaveErrors("X", [{ name: "Treino B", exercises: [{ ...exercise, name: " " }] }])).toEqual([
      "Treino B: o exercício 1 está sem nome",
    ]);
  });
});
