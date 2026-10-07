import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TABLE_PLACEHOLDER } from "./fichaPrompt";
import { parseWorkouts } from "./workoutParser";

// GOALS.md §34d — the "Prompt de formatação de ficha": a static text the trainer copies into their own AI. It says how
// to format the answer so parseWorkouts can read it, and nothing else — no student, no volume advice, no reference (§33).

const prompt = readFileSync(new URL("../../prompt/ficha_prompt_format.md", import.meta.url), "utf8");

/** The first fenced block AFTER "Exemplo de saída válida" (the instructions mention ``` earlier, mid-sentence). */
const exampleOf = (text: string) => text.slice(text.indexOf("Exemplo de saída válida")).split("```")[1];

describe("the formatting prompt", () => {
  it("asks for every treino in one answer, inside ONE code block, with titles the splitter reads", () => {
    expect(prompt).toContain("todos os treinos pedidos de uma vez");
    expect(prompt).toContain("UM ÚNICO bloco de código");
    expect(prompt).toContain("Treino A");
    expect(prompt).toContain("Não inclua músculos, porcentagens nem outros números");
    expect(prompt).toContain("o nome da ficha eu digito no site");
  });

  it("carries no placeholder, no student data and no volume advice", () => {
    expect(prompt).not.toContain(TABLE_PLACEHOLDER);
    expect(prompt).not.toMatch(/\{[A-Za-z_]+\}|\$[A-Z_]+\$/);
    expect(prompt).not.toMatch(/Pedido do Professor|Notas Médicas|Nome:|Dias de treino/);
    expect(prompt).not.toMatch(/volume|séries semanais|faixa ideal/i);
  });

  it("ends with an open line the trainer types their request after", () => {
    expect(prompt.trimEnd().split("\n").at(-1)).toBe("Meu pedido para o treino:");
  });

  it("its own worked example splits into exactly the treinos it shows", () => {
    const { workouts, warnings } = parseWorkouts(exampleOf(prompt));
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e tríceps", "Treino B — Costas e bíceps", "Treino C — Pernas"]);
    expect(workouts.map((w) => w.exercises.map((e) => [e.name, e.sets, e.reps]))).toEqual([
      [["Supino com halteres", 4, "10"], ["Tríceps testa", 3, "12"]],
      [["Remada curvada com barra", 4, "10"], ["Rosca direta", 3, "12"]],
      [["Agachamento livre", 4, "8"], ["Passada com halteres", 3, "10"]],
    ]);
    expect(workouts.every((w) => w.exercises.every((e) => e.muscleActivation === null))).toBe(true);
    expect(warnings).toEqual([]);
  });
});
