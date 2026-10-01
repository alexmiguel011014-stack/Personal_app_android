import { describe, expect, it } from "vitest";
import {
  currentFicha,
  historyFicha,
  MAX_REPLACEMENT_OPERATIONS,
  planReplacement,
  replacementOperations,
  splitFichas,
} from "./fichaHistory";
import type { Workout } from "./workouts";

function treino(id: string, overrides: Partial<Workout> = {}): Workout {
  return {
    id,
    trainerId: "trainerA",
    studentId: "studentA",
    name: `Treino ${id}`,
    isActive: true,
    exercises: [],
    createdAt: 1,
    status: "assigned",
    assignedAt: 2,
    archivedAt: null,
    ...overrides,
  };
}

/** A treino the previous replacement archived. */
const archived = (id: string, at = 100): Workout =>
  treino(id, { isActive: false, status: "draft", assignedAt: null, archivedAt: at });
/** A draft the trainer prepared, or deactivated by hand: inactive, never archived by a replacement. */
const inactive = (id: string): Workout => treino(id, { isActive: false, status: "draft", assignedAt: null });

const NOW = 500;
const incoming = [treino("n1", { status: "draft", assignedAt: null }), treino("n2", { status: "draft", assignedAt: null })];
const ids = (list: readonly Workout[]) => list.map((w) => w.id);

describe("planReplacement", () => {
  it("a student with nothing yet: only creates", () => {
    const plan = planReplacement([], incoming, NOW);
    expect(ids(plan.toCreate)).toEqual(["n1", "n2"]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toDelete).toEqual([]);
  });

  it("only a current ficha: it is archived, nothing is deleted", () => {
    const plan = planReplacement([treino("a"), treino("b")], incoming, NOW);
    expect(ids(plan.toArchive)).toEqual(["a", "b"]);
    expect(plan.toDelete).toEqual([]);
  });

  it("current + history: the current becomes history and the old history is deleted", () => {
    const plan = planReplacement([treino("a"), treino("b"), archived("old1"), archived("old2")], incoming, NOW);
    expect(ids(plan.toArchive)).toEqual(["a", "b"]);
    expect(ids(plan.toDelete)).toEqual(["old1", "old2"]);
    expect(ids(plan.toCreate)).toEqual(["n1", "n2"]);
  });

  it("writes the archived copies as an inactive draft stamped with the time of the replacement", () => {
    const [copy] = planReplacement([treino("a", { assignedAt: 7 })], incoming, NOW).toArchive;
    expect(copy).toMatchObject({ id: "a", isActive: false, status: "draft", assignedAt: null, archivedAt: NOW });
  });

  it("writes the new treinos as active, assigned and not archived", () => {
    const [first] = planReplacement([treino("a")], [treino("n1", { archivedAt: 9, isActive: false, status: "draft", assignedAt: null })], NOW).toCreate;
    expect(first).toMatchObject({ isActive: true, status: "assigned", assignedAt: NOW, archivedAt: null });
  });

  it("never touches a draft or a treino the trainer deactivated by hand", () => {
    const plan = planReplacement([treino("a"), inactive("draft1"), inactive("hand1"), archived("old1")], incoming, NOW);
    expect(ids(plan.toDelete)).toEqual(["old1"]);
    expect(ids(plan.toArchive)).toEqual(["a"]);
  });

  it("40 old inactive treinos and no history: none is deleted", () => {
    const old = Array.from({ length: 40 }, (_, i) => inactive(`o${i}`));
    const plan = planReplacement([treino("a"), ...old], incoming, NOW);
    expect(plan.toDelete).toEqual([]);
  });

  it("nothing active but a history: nothing is archived, so the history is NOT deleted", () => {
    const plan = planReplacement([archived("old1"), inactive("draft1")], incoming, NOW);
    expect(plan.toArchive).toEqual([]);
    expect(plan.toDelete).toEqual([]);
    expect(ids(plan.toCreate)).toEqual(["n1", "n2"]);
  });

  it("a history treino that was re-activated is current again: archived, never deleted", () => {
    const back = treino("back", { archivedAt: 100 }); // active, but a merge-write kept the field
    const plan = planReplacement([back, archived("old1")], incoming, NOW);
    expect(ids(plan.toArchive)).toEqual(["back"]);
    expect(ids(plan.toDelete)).toEqual(["old1"]);
  });

  it("a second replacement deletes exactly what the first one archived", () => {
    const first = planReplacement([treino("a"), treino("b")], incoming, 100);
    const afterFirst = [...first.toArchive, ...first.toCreate];
    const second = planReplacement(afterFirst, [treino("n3")], 200);
    expect(ids(second.toDelete)).toEqual(["a", "b"]);
    expect(ids(second.toArchive)).toEqual(["n1", "n2"]);
    expect(ids(second.toCreate)).toEqual(["n3"]);
  });

  it("toDelete never contains an active treino, whatever the input", () => {
    const mixed = [treino("a"), treino("b", { archivedAt: 5 }), archived("c"), inactive("d")];
    expect(planReplacement(mixed, incoming, NOW).toDelete.every((w) => !w.isActive)).toBe(true);
  });

  it("throws if a treino would be in two lists", () => {
    expect(() => planReplacement([treino("a")], [treino("a")], NOW)).toThrow(/more than one list/);
  });
});

describe("currentFicha / historyFicha / replacementOperations", () => {
  const all = [treino("a"), archived("h"), inactive("d"), treino("b", { archivedAt: 3 })];

  it("splits what the student sees from the history", () => {
    expect(ids(currentFicha(all))).toEqual(["a", "b"]);
    expect(ids(historyFicha(all))).toEqual(["h"]);
  });

  it("counts every write of the batch", () => {
    const plan = planReplacement([treino("a"), archived("h")], incoming, NOW);
    expect(replacementOperations(plan)).toBe(2 + 1 + 1);
    expect(MAX_REPLACEMENT_OPERATIONS).toBeLessThan(500);
  });
});

describe("splitFichas", () => {
  it("puts every treino in exactly one group", () => {
    const all = [treino("a"), archived("h"), inactive("d"), treino("b", { archivedAt: 3 }), inactive("e")];
    const { current, history, others } = splitFichas(all);
    expect(ids(current)).toEqual(["a", "b"]);
    expect(ids(history)).toEqual(["h"]);
    expect(ids(others)).toEqual(["d", "e"]);
    expect(current.length + history.length + others.length).toBe(all.length);
  });
});
