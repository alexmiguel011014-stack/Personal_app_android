import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SHORT_TABLE_NOTE, TABLE_PLACEHOLDER, buildMultiFichaPrompt, deidentified, type PromptStudent } from "./fichaPrompt";
import { parseWorkouts } from "./workoutParser";

// GOALS.md §25f — the web-only multi-treino prompt. fichaPrompt.test.ts (the phone's prompt) is untouched.

const maria: PromptStudent = {
  name: "Maria Souza",
  gender: "Feminino",
  goal: "Hipertrofia",
  experienceLevel: "Iniciante",
  medicalNotes: "Hérnia de disco L4-L5",
  trainingDays: ["Segunda", "Quarta", "Sexta"],
};

const template = readFileSync(new URL("../../prompt/ficha_prompt_multi.md", import.meta.url), "utf8");
const table = readFileSync(new URL("../../../app/src/main/assets/hypertrophy_volume_reference.md", import.meta.url), "utf8");

describe("the multi-treino template", () => {
  it("has exactly one table placeholder, so the table is spliced in once", () => {
    expect(template.split(TABLE_PLACEHOLDER)).toHaveLength(2);
  });

  it("asks for every treino in one answer, inside ONE code block, with titles the splitter reads", () => {
    expect(template).toContain("todos os treinos pedidos de uma vez");
    expect(template).toContain("UM ÚNICO bloco de código");
    expect(template).toContain("Treino A");
    expect(template).toContain("exatamente como está na tabela de referência");
  });

  it("its own worked example splits into the treinos it promises", () => {
    // The first fenced block AFTER "Exemplo de saída válida" (the instructions mention ``` earlier).
    const example = template.slice(template.indexOf("Exemplo de saída válida")).split("```")[1];
    const { workouts, warnings } = parseWorkouts(example);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e tríceps", "Treino B — Costas e bíceps", "Treino C — Pernas"]);
    expect(workouts.every((w) => w.exercises.every((e) => e.muscleActivation !== null))).toBe(true);
    expect(warnings).toEqual([]);
  });
});

describe("buildMultiFichaPrompt", () => {
  it("contains the table once, the profile and the request", () => {
    const prompt = buildMultiFichaPrompt(template, table, maria, "Monte 3 treinos.");
    expect(prompt.split(table)).toHaveLength(2);
    expect(prompt).not.toContain(TABLE_PLACEHOLDER);
    expect(prompt).toContain("Nome: Maria Souza");
    expect(prompt.endsWith("Pedido do Professor: Monte 3 treinos.")).toBe(true);
  });

  it("leaves the table out in short mode and says where it is — much shorter", () => {
    const full = buildMultiFichaPrompt(template, table, maria, "x");
    const short = buildMultiFichaPrompt(template, table, maria, "x", { shortPrompt: true });
    expect(short).toContain(SHORT_TABLE_NOTE);
    expect(short).not.toContain(table);
    expect(full.length - short.length).toBeGreaterThan(table.length - SHORT_TABLE_NOTE.length - 1);
  });

  it("can send the student without name or medical notes — and only those", () => {
    const prompt = buildMultiFichaPrompt(template, table, maria, "x", { deidentify: true });
    expect(prompt).toContain("Nome: Aluno");
    expect(prompt).toContain("Notas Médicas/Restrições: há restrições registradas pelo personal");
    expect(prompt).not.toContain("Maria");
    expect(prompt).not.toContain("Hérnia");
    expect(prompt).toContain("Objetivo: Hipertrofia");
    expect(prompt).toContain("Dias de treino na semana: Segunda, Quarta, Sexta");
  });

  it("deidentified() changes only the name and the notes — and says whether there were any", () => {
    expect(deidentified({ ...maria, medicalNotes: "" })).toEqual({ ...maria, name: "Aluno", medicalNotes: "não informado" });
    const withNotes = deidentified(maria);
    expect({ ...withNotes, medicalNotes: "", name: "" }).toEqual({ ...maria, medicalNotes: "", name: "" });
    expect(withNotes.medicalNotes).toContain("há restrições registradas");
    expect(withNotes.medicalNotes).not.toContain("Hérnia");
  });
});
