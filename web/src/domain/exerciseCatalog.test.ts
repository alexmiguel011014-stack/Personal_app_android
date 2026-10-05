import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseExerciseCatalog } from "../../scripts/build-exercise-catalog.mjs";
import { decodeExercises, encodeExercises } from "./exercise";
import {
  applyCatalogActivation,
  applyCatalogActivations,
  catalogActivation,
  lookupExercise,
  normalizeName,
  type ExerciseCatalog,
} from "./exerciseCatalog";
import type { Exercise } from "./exercise";
import { calculateEffectiveVolume } from "./workoutParser";

const markdownPath = fileURLToPath(new URL("../../../app/src/main/assets/hypertrophy_volume_reference.md", import.meta.url));
const scriptPath = fileURLToPath(new URL("../../scripts/build-exercise-catalog.mjs", import.meta.url));
const markdown = readFileSync(markdownPath, "utf8");
const catalog = parseExerciseCatalog(markdown);
const supino: Exercise = {
  name: "Supino reto",
  sets: 3,
  reps: "10",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: { Peitoral: 0.5, "Delt. ant.": 0.75 },
};

function countExerciseRows(source: string): number {
  return source.split(/\r?\n/).filter((line) => {
    if (!/^\s*\|.*\|\s*$/.test(line)) return false;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    const first = cells[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return first !== "exercicio" && !cells.every((cell) => /^:?-{3,}:?$/.test(cell));
  }).length;
}

describe("exercise catalog build", () => {
  it("parses every row in the shared Android reference table and uses only supported coefficients", () => {
    expect(catalog.exercises).toHaveLength(countExerciseRows(markdown));
    expect(catalog.version).toMatch(/^[a-f\d]{16}$/);
    for (const entry of catalog.exercises) {
      expect(entry.name).not.toBe("");
      expect(entry.group).not.toBe("");
      expect(Object.values(entry.muscles).every((value) => [0, 0.25, 0.5, 0.75, 1].includes(value))).toBe(true);
    }
  });

  it("builds the generated static asset from that same Markdown", () => {
    const generated = JSON.parse(execFileSync(process.execPath, [scriptPath, "--stdout"], { encoding: "utf8" })) as ExerciseCatalog;
    expect(generated).toEqual(catalog);
  });

  it("rejects an unreadable exercise row and reports its source line", () => {
    const broken = "# Tabela\n\n## Empurrar\n| Exercício | Peitoral |\n|---|---|\n| Supino | 2 |";
    expect(() => parseExerciseCatalog(broken)).toThrow(/Linha 6: coeficiente inválido/);
  });
});

describe("exercise catalog lookup", () => {
  it("returns the source row and exact muscle labels for a direct match", () => {
    const match = lookupExercise(catalog, "Supino reto");
    expect(match).toMatchObject({ how: "exact", entry: { name: "Supino reto" } });
    expect(catalogActivation(match!.entry)).toEqual({
      Peitoral: 1,
      "Delt. ant.": 0.5,
      "Tríceps geral": 0.5,
      "Cabeça longa tríceps": 0.25,
    });
  });

  it("matches case and accents, while dropping a known equipment qualifier only on the second attempt", () => {
    expect(lookupExercise(catalog, "SUPÍNO RÉTO")?.how).toBe("normalized");
    expect(applyCatalogActivation({ ...supino, name: "SUPÍNO RÉTO" }, catalog).muscleActivation).toEqual(
      catalogActivation(lookupExercise(catalog, "Supino reto")!.entry),
    );
    expect(lookupExercise(catalog, "Supino reto com barra")).toMatchObject({
      how: "normalized",
      entry: { name: "Supino reto" },
    });
    expect(normalizeName("Supino reto com barra")).not.toBe(normalizeName("Supino reto"));
  });

  it("only returns a close token match when it is unique", () => {
    expect(lookupExercise(catalog, "Pulldown estendidos")).toMatchObject({
      how: "close",
      entry: { name: "Pulldown braços estendidos" },
    });
    expect(lookupExercise(catalog, "Supino")).toBeNull();
    expect(lookupExercise(catalog, "Exercício que não existe")).toBeNull();
  });

  it("parses the monoarticular table without changing its muscle names", () => {
    const match = lookupExercise(catalog, "Elevação lateral");
    expect(match?.entry.muscles).toEqual({
      "Deltoide lateral": 1,
      "Delt. ant.": 0.25,
      "post.": 0.25,
      "trapézio superior": 0.25,
    });
  });

  it("overrides a differing annotation from the table and leaves unmatched annotations alone", () => {
    expect(applyCatalogActivation(supino, catalog).muscleActivation).toEqual(catalogActivation(lookupExercise(catalog, supino.name)!.entry));
    const custom = { ...supino, name: "Meu exercício", muscleActivation: { Personal: 0.75 } };
    expect(applyCatalogActivation(custom, catalog)).toEqual(custom);
  });

  it("keeps a close catalog suggestion out of preview and saved exercises until the trainer selects it", () => {
    const closeExercise: Exercise = { ...supino, name: "Pulldown estendidos", sets: 3, muscleActivation: null };
    expect(lookupExercise(catalog, closeExercise.name)?.how).toBe("close");

    const preview = applyCatalogActivations([closeExercise], catalog);
    expect(preview).toEqual([closeExercise]);
    expect(calculateEffectiveVolume(preview)).toEqual({});
    expect(decodeExercises(encodeExercises(preview))).toEqual([closeExercise]);

    const selectedExercise = { ...closeExercise, name: "Pulldown braços estendidos" };
    const selected = applyCatalogActivations([selectedExercise], catalog);
    const activation = catalogActivation(lookupExercise(catalog, selectedExercise.name)!.entry);
    expect(selected[0].muscleActivation).toEqual(activation);
    expect(calculateEffectiveVolume(selected)).toEqual(
      Object.fromEntries(Object.entries(activation).map(([muscle, coefficient]) => [muscle, 3 * coefficient])),
    );
    expect(decodeExercises(encodeExercises(selected))).toEqual(selected);
  });

  it("keeps an existing annotation for a close suggestion without assigning catalog volume", () => {
    const exercise: Exercise = {
      ...supino,
      name: "Pulldown estendidos",
      sets: 3,
      muscleActivation: { "Anotação original": 0.5 },
    };
    const preview = applyCatalogActivations([exercise], catalog);
    expect(preview).toEqual([exercise]);
    expect(calculateEffectiveVolume(preview)).toEqual({ "Anotação original": 1.5 });
  });
});
