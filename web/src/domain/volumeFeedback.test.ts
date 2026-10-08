import { describe, expect, it } from "vitest";
import type { Exercise } from "./exercise";
import type { ExerciseCatalog } from "./exerciseCatalog";
import { buildVolumeAdjustMessage, includedVolume } from "./volumeFeedback";

// GOALS.md §33e — the message that tells the AI where the week landed, without ever showing it the reference.

describe("buildVolumeAdjustMessage", () => {
  it("lists the muscles below and above the ideal range, with their totals, and asks for the whole ficha back", () => {
    const message = buildVolumeAdjustMessage({ "Músculo B": 8, "Músculo A": 24, "Músculo C": 15 })!;
    expect(message).toContain("- Músculo A: 24 séries efetivas por semana — acima da faixa ideal (12–20)");
    expect(message).toContain("- Músculo B: 8 séries efetivas por semana — abaixo da faixa ideal (12–20)");
    expect(message).not.toContain("Músculo C"); // already in the range
    expect(message).toContain("COMPLETA e atualizada");
    expect(message.indexOf("Músculo A")).toBeLessThan(message.indexOf("Músculo B")); // alphabetical, stable
  });

  it("formats half sets the Brazilian way and rounds to one decimal", () => {
    expect(buildVolumeAdjustMessage({ "Músculo A": 7.5 })).toContain("Músculo A: 7,5 séries");
    expect(buildVolumeAdjustMessage({ "Músculo A": 9.25 })).toContain("Músculo A: 9,3 séries");
  });

  it("leaves out incidental work under the minimum, so the AI is not asked to raise a helper muscle", () => {
    expect(buildVolumeAdjustMessage({ "Músculo A": 3.5, "Músculo B": 1 })).toBeNull();
    const message = buildVolumeAdjustMessage({ "Músculo A": 3.5, "Músculo B": 10 })!;
    expect(message).toContain("Músculo B");
    expect(message).not.toContain("Músculo A");
  });

  it("returns null when everything is in the range, so no pointless request is made", () => {
    expect(buildVolumeAdjustMessage({ "Músculo A": 12, "Músculo B": 20 })).toBeNull();
    expect(buildVolumeAdjustMessage({})).toBeNull();
  });

  it("carries only muscle labels, totals and band words — never an exercise, a coefficient or the table", () => {
    const message = buildVolumeAdjustMessage({ "Músculo A": 24, "Músculo B": 8 })!;
    const withoutNumbers = message.replace(/\d+(?:[.,]\d+)?/g, "");
    for (const forbidden of [/coeficiente/i, /tabela/i, /régua/i, /PDF/, /exerc[ií]cio\b(?! )/i]) {
      expect(withoutNumbers).not.toMatch(forbidden);
    }
  });
});

describe("includedVolume", () => {
  const exercise = (name: string, sets: number, muscleActivation: Record<string, number> | null = null): Exercise => ({
    name,
    sets,
    reps: "10",
    weight: null,
    restSeconds: null,
    notes: null,
    muscleActivation,
  });
  const catalog: ExerciseCatalog = {
    version: "v",
    exercises: [{ name: "Exercício Alfa", group: "G", muscles: { "Músculo X": 1, "Músculo Y": 0.5 } }],
  };

  it("adds up every treino of the ficha, with the catalog's muscles filled in", () => {
    const items = [
      { exercises: [exercise("Exercício Alfa", 4), exercise("Outro", 2, { "Músculo X": 0.5 })] },
      { exercises: [exercise("Exercício Alfa", 2)] },
    ];
    expect(includedVolume(items, catalog)).toEqual({ "Músculo X": 7, "Músculo Y": 3 });
  });

  it("is empty for a ficha with no treino", () => {
    expect(includedVolume([], catalog)).toEqual({});
  });

  it("falls back to the muscles the exercises already carry when there is no catalog", () => {
    expect(includedVolume([{ exercises: [exercise("Exercício Alfa", 4), exercise("Outro", 2, { "Músculo X": 0.5 })] }], null)).toEqual({
      "Músculo X": 1,
    });
  });
});
