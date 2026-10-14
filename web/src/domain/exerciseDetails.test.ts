import { describe, expect, it } from "vitest";
import { decodeExercises, encodeExercises, type Exercise } from "./exercise";
import {
  MAX_NOTES_LENGTH,
  exercisesHaveDetails,
  formatRest,
  hasDetails,
  linksIn,
  notesError,
  parseRestText,
  summarizeExercise,
  tidiedDetails,
  weightError,
} from "./exerciseDetails";

const base: Exercise = {
  name: "Supino",
  sets: 3,
  reps: "12",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: null,
};

describe("parseRestText", () => {
  it("reads whole seconds from 0 to 600 and treats blank as not set", () => {
    expect(parseRestText("")).toEqual({ seconds: null });
    expect(parseRestText("   ")).toEqual({ seconds: null });
    expect(parseRestText("0")).toEqual({ seconds: 0 });
    expect(parseRestText(" 90 ")).toEqual({ seconds: 90 });
    expect(parseRestText("600")).toEqual({ seconds: 600 });
  });

  it("refuses anything else, with a sentence for the trainer", () => {
    for (const bad of [
      "601",
      "1:30",
      "-5",
      "1.5",
      "90s",
      "abc",
      "9999",
      "٣٠",
    ]) {
      expect(parseRestText(bad), bad).toHaveProperty("error");
    }
    expect(parseRestText("601")).toEqual({
      error: "O descanso vai até 600 segundos (10 minutos).",
    });
  });
});

describe("limits", () => {
  it("counts the trimmed length of the observação and the carga", () => {
    expect(notesError("a".repeat(MAX_NOTES_LENGTH))).toBeNull();
    expect(notesError(`  ${"a".repeat(MAX_NOTES_LENGTH)}  `)).toBeNull();
    expect(notesError("a".repeat(MAX_NOTES_LENGTH + 1))).toMatch(/300/);
    expect(weightError("40kg")).toBeNull();
    expect(weightError("x".repeat(41))).toMatch(/40/);
  });
});

describe("formatRest", () => {
  it("shows seconds under a minute and m:ss from a minute on", () => {
    expect(formatRest(0)).toBe("0s");
    expect(formatRest(45)).toBe("45s");
    expect(formatRest(60)).toBe("1:00");
    expect(formatRest(90)).toBe("1:30");
    expect(formatRest(125)).toBe("2:05");
    expect(formatRest(600)).toBe("10:00");
  });
});

describe("linksIn", () => {
  it("finds http and https links, in order, once each", () => {
    expect(
      linksIn(
        "Veja https://youtu.be/abc e http://exemplo.com/x e de novo https://youtu.be/abc",
      ),
    ).toEqual(["https://youtu.be/abc", "http://exemplo.com/x"]);
  });

  it("does not take sentence punctuation as part of the link", () => {
    expect(linksIn("Vídeo: https://youtu.be/abc.")).toEqual([
      "https://youtu.be/abc",
    ]);
    expect(linksIn("(https://youtu.be/abc), ok?")).toEqual([
      "https://youtu.be/abc",
    ]);
    expect(linksIn('"https://youtu.be/abc"!')).toEqual([
      "https://youtu.be/abc",
    ]);
    expect(linksIn("https://youtu.be/abc?t=30;")).toEqual([
      "https://youtu.be/abc?t=30",
    ]);
  });

  it("keeps a closing parenthesis that closes one inside the link", () => {
    expect(
      linksIn("https://pt.wikipedia.org/wiki/Agachamento_(exercício)"),
    ).toEqual(["https://pt.wikipedia.org/wiki/Agachamento_(exercício)"]);
    expect(
      linksIn("(veja https://pt.wikipedia.org/wiki/Agachamento_(exercício))"),
    ).toEqual(["https://pt.wikipedia.org/wiki/Agachamento_(exercício)"]);
  });

  it("never treats a script, data or file URL — or a bare address — as a link", () => {
    expect(linksIn("javascript:alert(1)")).toEqual([]);
    expect(linksIn("JAVASCRIPT:alert(1) https://ok.com/a")).toEqual([
      "https://ok.com/a",
    ]);
    expect(linksIn("data:text/html;base64,PHNjcmlwdD4=")).toEqual([]);
    expect(linksIn("file:///etc/passwd")).toEqual([]);
    expect(linksIn("www.exemplo.com e exemplo.com")).toEqual([]);
    expect(linksIn("https://")).toEqual([]);
    expect(linksIn("nada aqui")).toEqual([]);
  });
});

describe("details on an exercise", () => {
  it("knows when there are none", () => {
    expect(hasDetails(base)).toBe(false);
    expect(hasDetails({ ...base, restSeconds: 0 })).toBe(true);
    expect(hasDetails({ ...base, weight: "40kg" })).toBe(true);
    expect(hasDetails({ ...base, notes: "devagar" })).toBe(true);
    expect(exercisesHaveDetails([base, base])).toBe(false);
    expect(exercisesHaveDetails([base, { ...base, notes: "x" }])).toBe(true);
  });

  it("stores a blank carga or observação as not set and trims the others", () => {
    expect(tidiedDetails({ ...base, weight: "   ", notes: "\n" })).toEqual(
      base,
    );
    expect(
      tidiedDetails({ ...base, weight: " 40kg ", notes: " devagar " }),
    ).toEqual({ ...base, weight: "40kg", notes: "devagar" });
    expect(tidiedDetails(base)).toEqual(base);
  });

  it("round-trips every field through the JSON the phone decodes", () => {
    const full: Exercise = {
      ...base,
      weight: "40kg",
      restSeconds: 90,
      notes: "Desça devagar https://youtu.be/abc",
      muscleActivation: { Peitoral: 1 },
    };
    const decoded = decodeExercises(encodeExercises([full]));
    expect(decoded).toEqual([full]);
    const json = JSON.parse(encodeExercises([full])) as Record<
      string,
      unknown
    >[];
    expect(Object.keys(json[0])).toEqual([
      "name",
      "sets",
      "reps",
      "weight",
      "restSeconds",
      "notes",
      "muscleActivation",
    ]);
  });

  it("encodes a rest of 0 (kotlinx would too) but leaves blank details out", () => {
    expect(
      JSON.parse(encodeExercises([{ ...base, restSeconds: 0 }]))[0],
    ).toEqual({ name: "Supino", sets: 3, reps: "12", restSeconds: 0 });
    expect(encodeExercises([base])).toBe(
      '[{"name":"Supino","sets":3,"reps":"12"}]',
    );
  });

  it("reads a document without the details as it always did", () => {
    expect(decodeExercises('[{"name":"Supino","sets":3,"reps":"12"}]')).toEqual(
      [base],
    );
  });
});

describe("summarizeExercise", () => {
  it("is just sets x reps when nothing else is set", () => {
    expect(summarizeExercise(base)).toEqual({
      line: "3x12",
      note: null,
      videoUrl: null,
    });
  });

  it("adds carga and descanso, then the note and its first link", () => {
    expect(
      summarizeExercise({
        ...base,
        weight: "40kg",
        restSeconds: 90,
        notes: "Desça devagar. Vídeo: https://youtu.be/abc.",
      }),
    ).toEqual({
      line: "3x12 · 40kg · descanso 1:30",
      note: "Desça devagar. Vídeo: https://youtu.be/abc.",
      videoUrl: "https://youtu.be/abc",
    });
  });

  it("shows a rest of 0 and ignores blank text", () => {
    expect(
      summarizeExercise({ ...base, weight: "  ", restSeconds: 0, notes: " " }),
    ).toEqual({ line: "3x12 · descanso 0s", note: null, videoUrl: null });
  });

  it("offers no video for a note whose only 'link' is a script", () => {
    expect(
      summarizeExercise({ ...base, notes: "javascript:alert(1)" }).videoUrl,
    ).toBeNull();
  });
});
