import { describe, expect, it } from "vitest";
import { DEFAULT_WEEKLY_TARGET, EMPTY_OPTIONS, composeRequest, defaultTreinos } from "./fichaRequest";

describe("composeRequest", () => {
  it("gives an empty request for empty options (today's behaviour)", () => {
    expect(composeRequest(EMPTY_OPTIONS)).toBe("");
  });

  it("names the treinos the splitter will look for, and asks for them all at once", () => {
    expect(composeRequest({ ...EMPTY_OPTIONS, treinos: 3, split: "abc" })).toBe(
      "Monte 3 treinos (Treino A, Treino B e Treino C), divisão ABC, todos na mesma resposta.",
    );
  });

  it("takes the count from the split when none is given, and the count wins when both are", () => {
    expect(composeRequest({ ...EMPTY_OPTIONS, split: "abcd" })).toContain("Monte 4 treinos (Treino A, Treino B, Treino C e Treino D)");
    expect(composeRequest({ ...EMPTY_OPTIONS, treinos: 5, split: "abc" })).toContain("Monte 5 treinos");
  });

  it("keeps the titles as Treino A… even for push/pull/legs", () => {
    const text = composeRequest({ ...EMPTY_OPTIONS, split: "ppl" });
    expect(text).toContain("Treino A, Treino B e Treino C");
    expect(text).toContain("push/pull/legs");
  });

  it("handles one treino and a split that depends on the days", () => {
    expect(composeRequest({ ...EMPTY_OPTIONS, treinos: 1 })).toBe("Monte 1 treino (Treino A), todos na mesma resposta.");
    expect(composeRequest({ ...EMPTY_OPTIONS, split: "full-body" })).toContain("um treino por dia de treino do aluno");
  });

  it("adds target, emphasis and limits, trimmed, and skips blanks", () => {
    expect(
      composeRequest({ treinos: null, split: "", weeklyTarget: ` ${DEFAULT_WEEKLY_TARGET} `, emphasis: "ombros", limits: "  " }),
    ).toBe(`Volume semanal alvo: ${DEFAULT_WEEKLY_TARGET}. Ênfase: ombros.`);
  });
});

describe("defaultTreinos", () => {
  it("is the number of training days when it makes sense", () => {
    expect(defaultTreinos(["Segunda", "Quarta", "Sexta"])).toBe(3);
    expect(defaultTreinos([])).toBeNull();
    expect(defaultTreinos(["a", "b", "c", "d", "e", "f", "g"])).toBeNull();
  });
});
