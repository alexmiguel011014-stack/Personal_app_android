import { describe, expect, it } from "vitest";
import {
  decodeExercises,
  decodePerformedSets,
  encodeExercises,
  encodePerformedSets,
  type Exercise,
} from "./exercise";

const supino: Exercise = {
  name: "Supino",
  sets: 3,
  reps: "12",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: null,
};

describe("exercisesJson", () => {
  it("leaves nulls out, as kotlinx.serialization does by default", () => {
    expect(encodeExercises([supino])).toBe('[{"name":"Supino","sets":3,"reps":"12"}]');
  });

  it("reads what the phone writes, including fields it doesn't know", () => {
    // kotlinx omits defaults, and the Kotlin side decodes with ignoreUnknownKeys.
    expect(decodeExercises('[{"name":"Supino","sets":3,"reps":"12","futureField":1}]')).toEqual([supino]);
  });

  it("round-trips every field", () => {
    const full: Exercise = {
      name: "Supino reto",
      sets: 4,
      reps: "10-12",
      weight: "20kg",
      restSeconds: 90,
      notes: "pegada média",
      muscleActivation: { Peitoral: 1, Triceps: 0.5 },
    };
    expect(decodeExercises(encodeExercises([full]))).toEqual([full]);
  });

  it.each([
    ["missing JSON", undefined],
    ["null", null],
    ["broken JSON", "[{"],
    ["an object instead of a list", '{"name":"Supino"}'],
  ])("reads %s as an empty list", (_label, json) => {
    expect(decodeExercises(json)).toEqual([]);
  });

  it("drops the whole list when one element is malformed, as kotlinx's decode does", () => {
    // sets as a string: kotlinx fails the list, the Kotlin mapper catches it and shows no exercises.
    expect(decodeExercises('[{"name":"A","sets":3,"reps":"12"},{"name":"B","sets":"3","reps":"12"}]')).toEqual([]);
    expect(decodeExercises('[{"sets":3,"reps":"12"}]')).toEqual([]);
  });
});

describe("performedSetsJson", () => {
  it("round-trips, and drops a malformed list as a whole", () => {
    const sets = [
      { setNumber: 1, weight: "20", reps: 12 },
      { setNumber: 2, weight: "22.5", reps: 10 },
    ];
    expect(decodePerformedSets(encodePerformedSets(sets))).toEqual(sets);
    expect(decodePerformedSets('[{"setNumber":1,"weight":20,"reps":12}]')).toEqual([]);
  });
});
