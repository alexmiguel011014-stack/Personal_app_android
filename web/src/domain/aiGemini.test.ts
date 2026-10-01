import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeAiError } from "./aiErrors";
import { DEFAULT_REQUEST, buildAdjustMessage, buildAiUserMessage } from "./aiRequest";
import { recordUse, usesToday, type CounterStorage } from "./aiUsage";
import { TABLE_PLACEHOLDER, deidentified, type PromptStudent } from "./fichaPrompt";

// GOALS.md §25i — the pure parts of the in-site Gemini flow: what is sent, what an error says, the
// soft daily counter, and the system instruction asset. (The network call itself is not tested here.)

const maria: PromptStudent = {
  name: "Maria Souza",
  gender: "Feminino",
  goal: "Hipertrofia",
  experienceLevel: "Iniciante",
  medicalNotes: "Hérnia de disco L4-L5",
  trainingDays: ["Segunda", "Quarta", "Sexta"],
};

describe("buildAiUserMessage — privacy by default", () => {
  it("does not send the name or the medical notes unless asked, but says restrictions exist", () => {
    const message = buildAiUserMessage(maria, "Monte 3 treinos.", false);
    expect(message).not.toContain("Maria");
    expect(message).not.toContain("Hérnia");
    expect(message).toContain("Nome: Aluno");
    expect(message).toContain("há restrições registradas pelo personal");
    expect(message).toContain("Objetivo: Hipertrofia");
    expect(message).toContain("Dias de treino na semana: Segunda, Quarta, Sexta");
    expect(message.endsWith("Pedido do Professor: Monte 3 treinos.")).toBe(true);
  });

  it("sends exactly those two fields when the trainer chooses to", () => {
    const message = buildAiUserMessage(maria, "x", true);
    expect(message).toContain("Nome: Maria Souza");
    expect(message).toContain("Hérnia de disco L4-L5");
  });

  it("says 'não informado' when there are no notes, and asks for a default ficha with no request", () => {
    expect(buildAiUserMessage({ ...maria, medicalNotes: "  " }, "", false)).toContain("Notas Médicas/Restrições: não informado");
    expect(buildAiUserMessage(maria, "   ", false)).toContain(DEFAULT_REQUEST);
  });

  it("deidentified() leaves every other field alone", () => {
    expect(deidentified(maria)).toMatchObject({ gender: "Feminino", goal: "Hipertrofia", trainingDays: maria.trainingDays });
  });

  it("the follow-up asks for the whole ficha back", () => {
    const text = buildAdjustMessage("  troque o supino reto por inclinado ");
    expect(text).toContain("troque o supino reto por inclinado");
    expect(text).toContain("COMPLETA");
  });
});

describe("describeAiError", () => {
  const sdkError = (status: number | undefined, code = "error", message = "x") =>
    Object.assign(new Error(message), { code: `AI/${code}`, customErrorData: status === undefined ? undefined : { status } });

  it("explains each documented failure, and always points at the other tab", () => {
    const cases: [unknown, RegExp][] = [
      [sdkError(429), /limite gratuito/],
      [sdkError(undefined, "error", "RESOURCE_EXHAUSTED: quota"), /limite gratuito/],
      [sdkError(503), /sobrecarregado/],
      [sdkError(403), /permissão/],
      [sdkError(undefined, "api-not-enabled"), /permissão/],
      [sdkError(undefined, "error", "To access this model, you must enforce Firebase App Check"), /permissão/],
      [sdkError(404), /não está mais disponível/],
      [sdkError(undefined, "fetch-error"), /conexão/],
      [new Error("algo estranho"), /Não foi possível gerar/],
      [undefined, /Não foi possível gerar/],
    ];
    for (const [error, expected] of cases) {
      const text = describeAiError(error);
      expect(text).toMatch(expected);
      expect(text).toContain("Outra IA");
    }
  });
});

describe("the daily counter", () => {
  const memory = (): CounterStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };
  const day = (d: number) => new Date(2026, 8, d, 10, 0);

  it("counts per local day", () => {
    const storage = memory();
    expect(usesToday(storage, day(30))).toBe(0);
    expect(recordUse(storage, day(30))).toBe(1);
    expect(recordUse(storage, day(30))).toBe(2);
    expect(usesToday(storage, day(30))).toBe(2);
    expect(usesToday(storage, day(31))).toBe(0);
  });

  it("works without storage, with garbage in it, and when storage throws", () => {
    expect(usesToday(null, day(30))).toBe(0);
    expect(recordUse(null, day(30))).toBe(1);
    const garbage = memory();
    garbage.data.set("ficha-gemini-uses-2026-09-30", "lixo");
    expect(usesToday(garbage, day(30))).toBe(0);
    const throwing: CounterStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(usesToday(throwing, day(30))).toBe(0);
    expect(recordUse(throwing, day(30))).toBe(1);
  });
});

describe("the Gemini system instruction", () => {
  const system = readFileSync(new URL("../../prompt/ficha_system_gemini.md", import.meta.url), "utf8");

  it("has one table placeholder and asks for JSON only, a full ficha back on adjustments", () => {
    expect(system.split(TABLE_PLACEHOLDER)).toHaveLength(2);
    const flat = system.replace(/\s+/g, " "); // the file wraps lines mid-sentence
    expect(flat).toContain("SOMENTE em JSON");
    expect(flat).toContain("completa e atualizada");
  });
});
