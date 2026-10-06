import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TABLE_PLACEHOLDER, buildWebFichaPrompt, deidentified, type PromptStudent } from "./fichaPrompt";
import { parseWorkouts } from "./workoutParser";
import { applyPaste } from "./workouts";

// GOALS.md §25f/§33 — the web-only prompts (several treinos / one treino). fichaPrompt.test.ts (the phone's
// prompt) is untouched. None of these templates carries the trainer's reference table (§33).

const maria: PromptStudent = {
  name: "Maria Souza",
  gender: "Feminino",
  goal: "Hipertrofia",
  experienceLevel: "Iniciante",
  medicalNotes: "Hérnia de disco L4-L5",
  trainingDays: ["Segunda", "Quarta", "Sexta"],
};

const read = (name: string) => readFileSync(new URL(`../../prompt/${name}`, import.meta.url), "utf8");
const template = read("ficha_prompt_multi.md");
const single = read("ficha_prompt_single.md");

/** The first fenced block AFTER "Exemplo de saída válida" (the instructions mention ``` earlier). */
const exampleOf = (text: string) => text.slice(text.indexOf("Exemplo de saída válida")).split("```")[1];

describe("the multi-treino template", () => {
  it("carries no table placeholder", () => {
    expect(template).not.toContain(TABLE_PLACEHOLDER);
  });

  it("asks for every treino in one answer, inside ONE code block, with titles the splitter reads", () => {
    expect(template).toContain("todos os treinos pedidos de uma vez");
    expect(template).toContain("UM ÚNICO bloco de código");
    expect(template).toContain("Treino A");
    expect(template).toContain("Não inclua músculos, porcentagens nem outros números");
  });

  it("its own worked example splits into the treinos it promises", () => {
    const { workouts, warnings } = parseWorkouts(exampleOf(template));
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e tríceps", "Treino B — Costas e bíceps", "Treino C — Pernas"]);
    expect(workouts.every((w) => w.exercises.every((e) => e.muscleActivation === null))).toBe(true);
    expect(workouts.map((w) => w.exercises.length)).toEqual([2, 2, 2]);
    expect(warnings).toEqual([]);
  });
});

describe("the single-treino template (editing an existing ficha)", () => {
  it("carries no table placeholder and asks for one treino in one code block", () => {
    expect(single).not.toContain(TABLE_PLACEHOLDER);
    expect(single).toContain("UM ÚNICO bloco de código");
    expect(single).toContain("Não inclua músculos, porcentagens nem outros números");
  });

  it("its worked example is one treino that the paste box reads", () => {
    const example = exampleOf(single);
    const parsed = parseWorkouts(example);
    expect(parsed.workouts).toHaveLength(1);
    const next = applyPaste(example, { name: "", exercises: [] });
    expect(next.name).toBe("Treino A");
    expect(next.exercises.map((e) => [e.name, e.sets, e.reps])).toEqual([
      ["Supino com halteres", 4, "10"],
      ["Tríceps testa", 3, "12"],
      ["Crucifixo com halteres", 3, "15"],
    ]);
    expect(next.exercises.every((e) => e.muscleActivation === null)).toBe(true);
  });
});

describe("buildWebFichaPrompt", () => {
  it("is the template, then the profile and the request — and nothing about a table", () => {
    const prompt = buildWebFichaPrompt(template, maria, "Monte 3 treinos.");
    expect(prompt.startsWith(template)).toBe(true);
    expect(prompt).toContain("Nome: Maria Souza");
    expect(prompt.endsWith("Pedido do Professor: Monte 3 treinos.")).toBe(true);
  });

  it("refuses a template that still carries the table placeholder instead of splicing in nothing", () => {
    expect(() => buildWebFichaPrompt(`x\n${TABLE_PLACEHOLDER}\n`, maria, "x")).toThrow(/placeholder/);
  });

  it("can send the student without name or medical notes — and only those", () => {
    const prompt = buildWebFichaPrompt(template, maria, "x", { deidentify: true });
    expect(prompt).toContain("Nome: Aluno");
    expect(prompt).toContain("Notas Médicas/Restrições: há restrições registradas pelo personal");
    expect(prompt).not.toContain("Maria");
    expect(prompt).not.toContain("Hérnia");
    expect(prompt).toContain("Objetivo: Hipertrofia");
    expect(prompt).toContain("Dias de treino na semana: Segunda, Quarta, Sexta");
  });

  it("works for the single template too, and without a student", () => {
    expect(buildWebFichaPrompt(single, maria, "x").startsWith(single)).toBe(true);
    expect(buildWebFichaPrompt("T", null, "pedido")).toBe("T\n\nPedido do Professor: pedido");
  });

  it("deidentified() changes only the name and the notes — and says whether there were any", () => {
    expect(deidentified({ ...maria, medicalNotes: "" })).toEqual({ ...maria, name: "Aluno", medicalNotes: "não informado" });
    const withNotes = deidentified(maria);
    expect({ ...withNotes, medicalNotes: "", name: "" }).toEqual({ ...maria, medicalNotes: "", name: "" });
    expect(withNotes.medicalNotes).toContain("há restrições registradas");
    expect(withNotes.medicalNotes).not.toContain("Hérnia");
  });
});
