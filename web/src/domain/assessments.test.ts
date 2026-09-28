import { describe, expect, it } from "vitest";
import { PAR_Q, decodeParQAnswers, flaggedQuestions, type Assessment } from "./assessments";

function assessment(parQAnswers: Record<string, boolean>): Assessment {
  return {
    id: "a1",
    studentId: "s1",
    trainerId: "t1",
    submittedAt: 1,
    parQAnswers,
    goal: "",
    experienceLevel: "",
    trainingDays: [],
  };
}

describe("flaggedQuestions", () => {
  it("lists the questions answered 'sim', in the questionnaire's order", () => {
    const flagged = flaggedQuestions(assessment({ medication: true, heart_condition: true, dizziness: false }));
    expect(flagged.map((question) => question.key)).toEqual(["heart_condition", "medication"]);
  });

  it("ignores keys that aren't PAR-Q+ questions", () => {
    expect(flaggedQuestions(assessment({ unknown: true }))).toEqual([]);
  });

  it("has the seven ParQ.QUESTIONS keys", () => {
    expect(PAR_Q.map((question) => question.key)).toEqual([
      "heart_condition",
      "chest_pain_activity",
      "chest_pain_rest",
      "dizziness",
      "bone_joint",
      "medication",
      "other_reason",
    ]);
  });
});

describe("decodeParQAnswers — the Kotlin mapper's all-or-nothing read", () => {
  it("reads an object of booleans", () => {
    expect(decodeParQAnswers('{"heart_condition":true,"medication":false}')).toEqual({
      heart_condition: true,
      medication: false,
    });
  });

  it("reads missing, malformed or wrongly-typed JSON as no answers", () => {
    for (const json of [null, "not json", "[]", "true", '{"heart_condition":"true"}', '{"a":true,"b":null}']) {
      expect(decodeParQAnswers(json)).toEqual({});
    }
  });
});
