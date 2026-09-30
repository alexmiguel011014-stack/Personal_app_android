import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TABLE_PLACEHOLDER, buildFichaPrompt, type PromptStudent } from "./fichaPrompt";

const maria: PromptStudent = {
  name: "Maria",
  gender: "Feminino",
  goal: "Hipertrofia",
  experienceLevel: "Iniciante",
  medicalNotes: "Nenhuma",
  trainingDays: ["Segunda", "Quarta", "Sexta"],
};

describe("buildFichaPrompt", () => {
  it("splices the table in, profile and request after — the same string the phone builds", () => {
    const prompt = buildFichaPrompt(`Antes\n${TABLE_PLACEHOLDER}\nDepois\n`, "|tabela|", maria, "foco em pernas");
    expect(prompt).toBe(
      "Antes\n|tabela|\nDepois\n" +
        "Nome: Maria\n" +
        "Sexo: Feminino\n" +
        "Objetivo: Hipertrofia\n" +
        "Nível: Iniciante\n" +
        "Notas Médicas/Restrições: Nenhuma\n" +
        "Dias de treino na semana: Segunda, Quarta, Sexta" +
        "\n\nPedido do Professor: foco em pernas",
    );
  });

  it("inserts the table literally, even if it contains $& or $1", () => {
    // String.replace would expand these as replacement patterns.
    expect(buildFichaPrompt(TABLE_PLACEHOLDER, "custo $& e $1", null, "x")).toBe(
      "custo $& e $1\n\nPedido do Professor: x",
    );
  });

  it("leaves the profile out when there's no student", () => {
    expect(buildFichaPrompt("T", "", null, "pedido")).toBe("T\n\nPedido do Professor: pedido");
  });

  it("keeps the whole block indented when a note spans lines — Kotlin's trimIndent runs after interpolation", () => {
    const prompt = buildFichaPrompt("", "", { ...maria, medicalNotes: "Lesão no joelho\nEvitar impacto", trainingDays: ["Segunda"] }, "x");
    const indent = " ".repeat(12);
    expect(prompt).toBe(
      `${indent}Nome: Maria\n` +
        `${indent}Sexo: Feminino\n` +
        `${indent}Objetivo: Hipertrofia\n` +
        `${indent}Nível: Iniciante\n` +
        `${indent}Notas Médicas/Restrições: Lesão no joelho\n` +
        "Evitar impacto\n" +
        `${indent}Dias de treino na semana: Segunda` +
        "\n\nPedido do Professor: x",
    );
  });

  it("works with the real template and table the phone ships", () => {
    const asset = (name: string) => readFileSync(new URL(`../../../app/src/main/assets/${name}`, import.meta.url), "utf8");
    const template = asset("ficha_prompt_template.md");
    const table = asset("hypertrophy_volume_reference.md");
    expect(template.split(TABLE_PLACEHOLDER)).toHaveLength(2); // exactly one placeholder
    const prompt = buildFichaPrompt(template, table, maria, "foco em pernas");
    expect(prompt).not.toContain(TABLE_PLACEHOLDER);
    expect(prompt).toContain(table);
    expect(prompt.endsWith("Pedido do Professor: foco em pernas")).toBe(true);
  });
});
