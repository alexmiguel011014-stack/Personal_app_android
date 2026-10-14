import { describe, expect, it } from "vitest";
import {
  PAR_Q,
  completeAnswers,
  decodeParQAnswers,
  encodeParQAnswers,
  flaggedQuestions,
  unansweredCount,
  type Assessment,
} from "./assessments";

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
    anamnesis: null,
    consentVersion: null,
    consentAt: null,
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

describe("a PAR-Q+ being filled in (GOALS.md §38c, D10) — nothing is answered until it is tapped", () => {
  const allNo = Object.fromEntries(PAR_Q.map((question) => [question.key, false]));

  it("counts the questions still unanswered", () => {
    expect(unansweredCount({})).toBe(7);
    expect(unansweredCount({ heart_condition: false, medication: true })).toBe(5);
    expect(unansweredCount(allNo)).toBe(0);
  });

  it("gives no answers while any question is unanswered, so the form cannot be sent", () => {
    expect(completeAnswers({})).toBeNull();
    expect(completeAnswers({ ...allNo, dizziness: undefined })).toBeNull();
  });

  it("stores exactly what the phone stores for the same answers: every question, in order, 'sim' as true", () => {
    expect(completeAnswers(allNo)).toEqual(allNo);
    const mixed = { ...allNo, bone_joint: true, medication: true };
    const stored = completeAnswers(mixed);
    expect(stored).toEqual(mixed);
    expect(encodeParQAnswers(stored!)).toBe(encodeParQAnswers(mixed));
    expect(Object.keys(stored!)).toEqual(PAR_Q.map((question) => question.key));
  });
});

describe("encodeParQAnswers — what the phone writes", () => {
  it("writes every question, in the questionnaire's order, and nothing else", () => {
    const json = encodeParQAnswers({ medication: true, heart_condition: false, stray: true });
    expect(Object.keys(JSON.parse(json))).toEqual(PAR_Q.map((question) => question.key));
    expect(decodeParQAnswers(json)).toMatchObject({ medication: true, heart_condition: false, dizziness: false });
    expect(json).not.toContain("stray");
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
