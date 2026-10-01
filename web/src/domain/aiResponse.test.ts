import { describe, expect, it } from "vitest";
import { treinosFromAi } from "./aiResponse";

describe("treinosFromAi", () => {
  const good = {
    treinos: [
      {
        nome: "Treino A — Peito e tríceps",
        exercicios: [
          { nome: "Supino reto", series: 4, reps: "10", ativacao: [{ musculo: "Peitoral", coeficiente: 1 }, { musculo: "Delt. ant.", coeficiente: 0.5 }] },
          { nome: "Tríceps pushdown", series: 3, reps: "12-15" },
        ],
      },
      { nome: "Treino B — Costas", exercicios: [{ nome: "Remada neutra cotovelo junto", series: 3, reps: "10" }] },
    ],
  };

  it("turns the model's JSON into the same treinos the text splitter makes", () => {
    const { workouts, warnings } = treinosFromAi(good);
    expect(workouts.map((w) => w.name)).toEqual(["Treino A — Peito e tríceps", "Treino B — Costas"]);
    expect(workouts[0].exercises[0]).toMatchObject({ name: "Supino reto", sets: 4, reps: "10", weight: null });
    expect(workouts[0].exercises[0].muscleActivation).toEqual({ Peitoral: 1, "Delt. ant.": 0.5 });
    expect(workouts[0].exercises[1].muscleActivation).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("accepts the JSON as text, as the SDK hands it over", () => {
    expect(treinosFromAi(JSON.stringify(good)).workouts).toHaveLength(2);
  });

  it("says so, instead of throwing, when the text is not JSON or has no treinos", () => {
    expect(treinosFromAi("não é json").warnings).toEqual(["A resposta do Gemini não veio no formato esperado."]);
    expect(treinosFromAi({}).warnings).toEqual(["A resposta do Gemini não trouxe treinos."]);
    expect(treinosFromAi({ treinos: "x" }).workouts).toEqual([]);
  });

  it("tolerates odd types: sets as text or a decimal, a missing name, a number for reps", () => {
    const { workouts } = treinosFromAi({
      treinos: [{ exercicios: [{ nome: "Supino", series: "4", reps: 10 }, { nome: "Remada", series: 3.4, reps: "8" }] }],
    });
    expect(workouts[0].name).toBe("Treino 1");
    expect(workouts[0].exercises.map((e) => [e.sets, e.reps])).toEqual([[4, "10"], [3, "8"]]);
  });

  it("skips an exercise with no usable sets, and a treino with nothing left, with a warning each", () => {
    const { workouts, warnings } = treinosFromAi({
      treinos: [
        { nome: "Treino A", exercicios: [{ nome: "Supino", series: 0, reps: "10" }, { nome: "Remada", series: 3, reps: "10" }] },
        { nome: "Treino B", exercicios: [{ nome: "Rosca", series: "x" }] },
      ],
    });
    expect(workouts.map((w) => w.name)).toEqual(["Treino A"]);
    expect(warnings).toEqual([
      "Treino A: “Supino” veio sem número de séries válido e foi ignorado.",
      "Treino B: “Rosca” veio sem número de séries válido e foi ignorado.",
      "Treino B não tem exercícios e foi ignorado.",
    ]);
  });

  it("ignores malformed activation entries and keeps the good ones", () => {
    const { workouts } = treinosFromAi({
      treinos: [
        {
          nome: "A",
          exercicios: [
            {
              nome: "Supino",
              series: 3,
              reps: "10",
              ativacao: [{ musculo: "Peitoral", coeficiente: 1 }, { musculo: "", coeficiente: 1 }, { musculo: "X", coeficiente: "0,5" }, "lixo"],
            },
          ],
        },
      ],
    });
    expect(workouts[0].exercises[0].muscleActivation).toEqual({ Peitoral: 1 });
  });
});
