import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCatalog, readCatalogSource } from "../../scripts/lib/catalogSource.mjs";
import { findLeaks, isLeak, loadSentinels, normalizeForScan } from "../../scripts/lib/referenceSentinels.mjs";
import { DEFAULT_REQUEST, buildAdjustMessage, buildAiUserMessage } from "./aiRequest";
import { EDITOR_COPY } from "./editorCopy";
import { buildWebFichaPrompt, type PromptStudent } from "./fichaPrompt";
import { buildVolumeAdjustMessage } from "./volumeFeedback";

// GOALS.md section 33f - the trainer's reference table must never reach a reader or an AI. This is the unit-level guard
// (the build scan, scripts/check-no-reference-leak.mjs, is the one for the finished site). The sentinels are derived at
// run time from the reference's own source, so nothing of the table is written in this file; if there is no source the
// derivation throws and THIS FILE FAILS - it never passes vacuously.

const sentinels = loadSentinels();
const here = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(here(path), "utf8");

const maria: PromptStudent = {
  name: "Maria Souza",
  gender: "Feminino",
  goal: "Hipertrofia",
  experienceLevel: "Iniciante",
  medicalNotes: "Hérnia de disco L4-L5",
  trainingDays: ["Segunda", "Quarta", "Sexta"],
};

// What a person or an AI could be shown, as text.
const templates = {
  "ficha_prompt_multi.md": read("../../prompt/ficha_prompt_multi.md"),
  "ficha_prompt_single.md": read("../../prompt/ficha_prompt_single.md"),
  "ficha_system_gemini.md": read("../../prompt/ficha_system_gemini.md"),
};

const prompts: Record<string, string> = {
  "multi prompt": buildWebFichaPrompt(templates["ficha_prompt_multi.md"], maria, "Monte 3 treinos."),
  "multi prompt, deidentified": buildWebFichaPrompt(templates["ficha_prompt_multi.md"], maria, "x", { deidentify: true }),
  "single prompt": buildWebFichaPrompt(templates["ficha_prompt_single.md"], maria, "foco em pernas"),
  "gemini user message": buildAiUserMessage(maria, DEFAULT_REQUEST, true),
  "gemini follow-up": buildAdjustMessage("troque um exercício"),
  "volume request": buildVolumeAdjustMessage({ "Músculo A": 24, "Músculo B": 8, "Músculo C": 15 }) ?? "",
};

const copy: Record<string, string> = Object.fromEntries(
  Object.entries(EDITOR_COPY).map(([key, value]) => [`EDITOR_COPY.${key}`, typeof value === "function" ? value("Exercício qualquer") : value]),
);

const componentSources: Record<string, string> = Object.fromEntries(
  ["FichaEditor.tsx", "GeminiPanel.tsx", "MultiFichaReview.tsx", "RequestBuilder.tsx"].map((file) => [
    file,
    read(`../app/app/fichas/editar/${file}`),
  ]),
);

// Words that name the reference to a reader: the ruler, the coefficients, the document, the table (singular - "tabelas
// formatadas" in a format rule is about markdown, not about the reference).
const FORBIDDEN_WORDS = /\btabela\b|coeficiente|régua|\bPDF\b|hypertrophy_volume_reference|exercise-catalog/i;

describe("the guard itself", () => {
  it("derives sentinels from the reference's source, and has something to guard", () => {
    expect(sentinels.phrases.length).toBeGreaterThan(5);
    expect(sentinels.names.length).toBeGreaterThan(10);
  });

  it("refuses to pass vacuously: with no source and no sentinels file it throws", () => {
    const saved = { source: process.env.CATALOG_SOURCE, file: process.env.LEAK_SENTINELS_FILE };
    try {
      delete process.env.LEAK_SENTINELS_FILE;
      process.env.CATALOG_SOURCE = "this/file/does/not/exist.md";
      expect(() => loadSentinels()).toThrow(/not found|nothing to guard/);
    } finally {
      if (saved.source === undefined) delete process.env.CATALOG_SOURCE;
      else process.env.CATALOG_SOURCE = saved.source;
      if (saved.file !== undefined) process.env.LEAK_SENTINELS_FILE = saved.file;
    }
  });

  it("catches what it exists to catch: a pasted line of prose, a pasted heading, a pasted list of names", () => {
    const { markdown } = readCatalogSource();
    const prose = markdown.split(/\r?\n/).find((line) => !line.startsWith("|") && !line.startsWith("#") && normalizeForScan(line).trim().split(" ").length >= 8)!;
    const heading = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line))!;
    expect(isLeak(findLeaks(`Antes.\n${prose}\nDepois.`, sentinels))).toBe(true);
    expect(isLeak(findLeaks(`${heading}\nresto`, sentinels))).toBe(true);
    const names = buildCatalog().exercises.slice(0, 3).map((entry) => entry.name);
    expect(isLeak(findLeaks(names.join(", "), sentinels))).toBe(true);
    // ...and it is not trigger-happy: a lone exercise name in an example is fine outside a template, never inside one.
    expect(isLeak(findLeaks(`Exemplo: ${names[0]} 3x10`, sentinels))).toBe(false);
    expect(isLeak(findLeaks(`Exemplo: ${names[0]} 3x10`, sentinels), { allowNames: 0 })).toBe(true);
  });

  it("does not mistake the format rule 'tabelas formatadas' for the reference", () => {
    expect(FORBIDDEN_WORDS.test("sem negrito, sem listas, sem tabelas formatadas")).toBe(false);
    expect(FORBIDDEN_WORDS.test("use a tabela abaixo")).toBe(true);
  });
});

describe.each(Object.entries(templates))("template %s", (_name, text) => {
  it("carries no phrase, no exercise name and none of the words that name the reference", () => {
    expect(isLeak(findLeaks(text, sentinels), { allowNames: 0 })).toBe(false);
    expect(findLeaks(text, sentinels)).toEqual({ phraseHits: 0, nameHits: 0 });
    expect(text).not.toMatch(FORBIDDEN_WORDS);
    expect(text).not.toContain("$TABLE_PLACEHOLDER$");
  });
});

describe.each(Object.entries(prompts))("%s", (_name, text) => {
  it("is built from nothing of the reference", () => {
    expect(text).not.toBe("");
    expect(isLeak(findLeaks(text, sentinels), { allowNames: 0 })).toBe(false);
    expect(text).not.toMatch(FORBIDDEN_WORDS);
  });
});

describe.each(Object.entries(copy))("%s", (_name, text) => {
  it("is a sentence that never names the reference", () => {
    expect(isLeak(findLeaks(text, sentinels), { allowNames: 0 })).toBe(false);
    expect(text).not.toMatch(FORBIDDEN_WORDS);
  });
});

describe.each(Object.entries(componentSources))("the editor component %s", (_name, source) => {
  it("has no phrase of the reference and fewer than three of its exercise names in its text", () => {
    expect(isLeak(findLeaks(source, sentinels))).toBe(false);
  });
});
