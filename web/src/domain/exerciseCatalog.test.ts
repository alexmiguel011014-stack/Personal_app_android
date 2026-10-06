import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseExerciseCatalog } from "../../scripts/build-exercise-catalog.mjs";
import { catalogSourceExists, catalogSourcePath } from "../../scripts/lib/catalogSource.mjs";
import { decodeExercises, encodeExercises } from "./exercise";
import {
  MAX_SUGGESTIONS,
  applyCatalogActivation,
  applyCatalogActivations,
  catalogActivation,
  lookupExercise,
  normalizeName,
  suggestExercises,
  type ExerciseCatalog,
} from "./exerciseCatalog";
import type { Exercise } from "./exercise";
import { calculateEffectiveVolume } from "./workoutParser";

// GOALS.md §25c/§33 — the catalog's parsing and lookup, on SYNTHETIC exercises: from §33 on no test or fixture
// in this repository carries a real row of the trainer's reference table. The one test that touches the real
// source (the structural one below) asserts counts and shapes only, never names or numbers.

const scriptPath = fileURLToPath(new URL("../../scripts/lib/catalogSource.mjs", import.meta.url));

const SYNTHETIC_MARKDOWN = [
  "# Fonte sintética",
  "",
  "## Grupo Um",
  "| Exercício | Músculo X | Músculo Y | Músculo W |",
  "|---|---|---|---|",
  "| Exercício Alfa | 1 | 0,5 | 0 |",
  "| Exercício Alfa inclinado | 1 | 0,75 | 0 |",
  "| Exercício Gama longo estendido | 0,25 | 1 | 0,5 |",
  "",
  "## Grupo Dois",
  "| Exercício | 1,0 | 0,75 | 0,5 | 0,25 |",
  "|---|---|---|---|---|",
  "| Exercício Beta | Músculo Y; Músculo Q | - | Músculo X | Músculo Z |",
  "| Exercício Delta com extensão | Músculo Z | - | - | - |",
  "",
].join("\n");

const catalog: ExerciseCatalog = parseExerciseCatalog(SYNTHETIC_MARKDOWN);

const alfa: Exercise = {
  name: "Exercício Alfa",
  sets: 3,
  reps: "10",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: { "Músculo X": 0.5, "Músculo Y": 0.75 },
};

describe("exercise catalog parsing", () => {
  it("reads both table shapes (one column per muscle, one column per level) and keeps each muscle label exactly", () => {
    expect(catalog.exercises.map((entry) => [entry.name, entry.group])).toEqual([
      ["Exercício Alfa", "Grupo Um"],
      ["Exercício Alfa inclinado", "Grupo Um"],
      ["Exercício Gama longo estendido", "Grupo Um"],
      ["Exercício Beta", "Grupo Dois"],
      ["Exercício Delta com extensão", "Grupo Dois"],
    ]);
    expect(catalog.exercises[3].muscles).toEqual({ "Músculo Y": 1, "Músculo Q": 1, "Músculo X": 0.5, "Músculo Z": 0.25 });
    expect(catalog.version).toMatch(/^[a-f\d]{16}$/);
  });

  it("rejects an unreadable exercise row and reports its source line", () => {
    const broken = "# Tabela\n\n## Grupo\n| Exercício | Músculo X |\n|---|---|\n| Alfa | 2 |";
    expect(() => parseExerciseCatalog(broken)).toThrow(/Linha 6: coeficiente inválido/);
  });

  it("rejects a duplicated exercise name and a table with no exercise", () => {
    const twice = "## G\n| Exercício | Músculo X |\n|---|---|\n| Alfa | 1 |\n| Alfa | 1 |";
    expect(() => parseExerciseCatalog(twice)).toThrow(/duplicado/);
    expect(() => parseExerciseCatalog("# nada")).toThrow(/Nenhuma tabela/);
  });
});

// The real source, structure only. Skipped when the source lives somewhere this checkout does not have; the leak guard
// (referenceLeak.test.ts) is the one that must FAIL when there is nothing to guard.
describe.skipIf(!catalogSourceExists())("the real reference source (structure only)", () => {
  const markdown = catalogSourceExists() ? readFileSync(catalogSourcePath(), "utf8") : "";
  const real = catalogSourceExists() ? parseExerciseCatalog(markdown) : { version: "", exercises: [] };

  function countExerciseRows(source: string): number {
    return source.split(/\r?\n/).filter((line) => {
      if (!/^\s*\|.*\|\s*$/.test(line)) return false;
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const first = cells[0].normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      return first !== "exercicio" && !cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }).length;
  }

  it("parses every row, with only the supported coefficients, and fits the rules' limit of 300 exercises", () => {
    expect(real.exercises).toHaveLength(countExerciseRows(markdown));
    expect(real.exercises.length).toBeGreaterThan(0);
    expect(real.exercises.length).toBeLessThanOrEqual(300);
    for (const entry of real.exercises) {
      expect(entry.name).not.toBe("");
      expect(entry.group).not.toBe("");
      expect(Object.values(entry.muscles).every((value) => [0, 0.25, 0.5, 0.75, 1].includes(value))).toBe(true);
    }
    expect(new Set(real.exercises.map((entry) => entry.name)).size).toBe(real.exercises.length);
  });

  it("prints the same catalog from the command line (`node scripts/lib/catalogSource.mjs`)", () => {
    const printed = JSON.parse(execFileSync(process.execPath, [scriptPath], { encoding: "utf8" })) as ExerciseCatalog;
    expect(printed).toEqual(real);
  });
});

describe("exercise catalog lookup", () => {
  it("returns the source row and exact muscle labels for a direct match", () => {
    const match = lookupExercise(catalog, "Exercício Alfa");
    expect(match).toMatchObject({ how: "exact", entry: { name: "Exercício Alfa" } });
    expect(catalogActivation(match!.entry)).toEqual({ "Músculo X": 1, "Músculo Y": 0.5 }); // the zero is dropped
  });

  it("matches case and accents, while dropping a known equipment qualifier only on the second attempt", () => {
    expect(lookupExercise(catalog, "EXERCÍCIO ÁLFA")?.how).toBe("normalized");
    expect(applyCatalogActivation({ ...alfa, name: "EXERCÍCIO ÁLFA" }, catalog).muscleActivation).toEqual(
      catalogActivation(lookupExercise(catalog, "Exercício Alfa")!.entry),
    );
    expect(lookupExercise(catalog, "Exercício Alfa com barra")).toMatchObject({ how: "normalized", entry: { name: "Exercício Alfa" } });
    expect(normalizeName("Exercício Alfa com barra")).not.toBe(normalizeName("Exercício Alfa"));
  });

  it("only returns a close token match when it is unique", () => {
    expect(lookupExercise(catalog, "Gama estendido")).toMatchObject({ how: "close", entry: { name: "Exercício Gama longo estendido" } });
    expect(lookupExercise(catalog, "Exercício")).toBeNull(); // every entry would fit
    expect(lookupExercise(catalog, "Alfa")).toBeNull(); // two entries would fit
    expect(lookupExercise(catalog, "Exercício que não existe")).toBeNull();
  });

  it("overrides a differing annotation from the table and leaves unmatched annotations alone", () => {
    expect(applyCatalogActivation(alfa, catalog).muscleActivation).toEqual(catalogActivation(lookupExercise(catalog, alfa.name)!.entry));
    const custom = { ...alfa, name: "Meu exercício", muscleActivation: { Personal: 0.75 } };
    expect(applyCatalogActivation(custom, catalog)).toEqual(custom);
  });

  it("keeps a close catalog suggestion out of preview and saved exercises until the trainer selects it", () => {
    const closeExercise: Exercise = { ...alfa, name: "Gama estendido", sets: 3, muscleActivation: null };
    expect(lookupExercise(catalog, closeExercise.name)?.how).toBe("close");

    const preview = applyCatalogActivations([closeExercise], catalog);
    expect(preview).toEqual([closeExercise]);
    expect(calculateEffectiveVolume(preview)).toEqual({});
    expect(decodeExercises(encodeExercises(preview))).toEqual([closeExercise]);

    const selectedExercise = { ...closeExercise, name: "Exercício Gama longo estendido" };
    const selected = applyCatalogActivations([selectedExercise], catalog);
    const activation = catalogActivation(lookupExercise(catalog, selectedExercise.name)!.entry);
    expect(selected[0].muscleActivation).toEqual(activation);
    expect(calculateEffectiveVolume(selected)).toEqual(
      Object.fromEntries(Object.entries(activation).map(([muscle, coefficient]) => [muscle, 3 * coefficient])),
    );
    expect(decodeExercises(encodeExercises(selected))).toEqual(selected);
  });

  it("keeps an existing annotation for a close suggestion without assigning catalog volume", () => {
    const exercise: Exercise = { ...alfa, name: "Gama estendido", sets: 3, muscleActivation: { "Anotação original": 0.5 } };
    const preview = applyCatalogActivations([exercise], catalog);
    expect(preview).toEqual([exercise]);
    expect(calculateEffectiveVolume(preview)).toEqual({ "Anotação original": 1.5 });
  });
});

describe("suggestExercises — a few names for a name nobody matched, never the list", () => {
  it("offers the closest entries first and never one that shares no word", () => {
    expect(suggestExercises(catalog, "Alfa lateral").map((entry) => entry.name)).toEqual([
      "Exercício Alfa",
      "Exercício Alfa inclinado",
    ]);
    expect(suggestExercises(catalog, "Qualquer coisa totalmente diferente")).toEqual([]);
    expect(suggestExercises(catalog, "")).toEqual([]);
    expect(suggestExercises(catalog, "de a o")).toEqual([]); // only filler words
  });

  it("is deterministic: a tie keeps the catalog's own order", () => {
    const first = suggestExercises(catalog, "Exercício").map((entry) => entry.name);
    expect(first).toEqual(suggestExercises(catalog, "Exercício").map((entry) => entry.name));
    expect(first).toEqual(["Exercício Alfa", "Exercício Beta", "Exercício Alfa inclinado"]);
  });

  it("never offers more than MAX_SUGGESTIONS, whatever limit is asked for", () => {
    expect(MAX_SUGGESTIONS).toBe(3);
    expect(suggestExercises(catalog, "Exercício", 50)).toHaveLength(3);
    expect(suggestExercises(catalog, "Exercício", 1)).toHaveLength(1);
    expect(suggestExercises(catalog, "Exercício", 0)).toEqual([]);
    const big: ExerciseCatalog = {
      version: "v",
      exercises: Array.from({ length: 40 }, (_, index) => ({ name: `Exercício ${index}`, group: "G", muscles: { "Músculo X": 1 } })),
    };
    expect(suggestExercises(big, "Exercício", 1000)).toHaveLength(3);
  });
});
