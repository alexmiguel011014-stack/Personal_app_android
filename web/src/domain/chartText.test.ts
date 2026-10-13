import { describe, expect, it } from "vitest";
import { barChartLabel, compactReais, deltaText, progressLabel, progressRatio, sparkPoints, sparklineLabel, stackedBarLabel, trendOf } from "./chartText";

describe("deltaText", () => {
  it("writes the sign, the amount and what it is compared with", () => {
    expect(deltaText({ value: 2, direction: "up" }, "7 dias antes")).toBe("+2 vs. 7 dias antes");
    expect(deltaText({ value: 3, direction: "down" }, "7 dias antes")).toBe("−3 vs. 7 dias antes");
    expect(deltaText({ value: 0, direction: "same" }, "7 dias antes")).toBe("Sem mudança vs. 7 dias antes");
    expect(deltaText({ value: 5, direction: "up" }, "28 dias antes", " pp")).toBe("+5 pp vs. 28 dias antes");
  });
});

describe("trendOf", () => {
  it("reads rising, falling and flat series", () => {
    expect(trendOf([1, 1, 4, 5])).toBe("subindo");
    expect(trendOf([5, 4, 1, 1])).toBe("caindo");
    expect(trendOf([3, 3, 3, 3])).toBe("estável");
    expect(trendOf([10, 10, 10, 10.5])).toBe("estável"); // inside the 10% tolerance
    expect(trendOf([7])).toBe("estável");
    expect(trendOf([0, 0, 0, 0])).toBe("estável");
  });
});

describe("chart sentences", () => {
  const points = [{ label: "21/09", value: 2 }, { label: "28/09", value: 5 }, { label: "05/10", value: 3 }];

  it("lists every bar and names the peak", () => {
    expect(barChartLabel("Treinos por semana", points)).toBe("Treinos por semana: 21/09 2; 28/09 5; 05/10 3. Maior valor: 5 em 28/09.");
  });

  it("says plainly when nothing happened, and when there is no data", () => {
    expect(barChartLabel("Treinos", [{ label: "a", value: 0 }])).toBe("Treinos: a 0. Nenhum registro no período.");
    expect(barChartLabel("Treinos", [])).toBe("Treinos: sem dados.");
  });

  it("formats values with the caller's formatter", () => {
    expect(barChartLabel("Receita", [{ label: "out", value: 100 }], (v) => `R$ ${v / 100}`)).toBe("Receita: out R$ 1. Maior valor: R$ 1 em out.");
  });

  it("gives a sparkline its trend and extremes", () => {
    expect(sparklineLabel("Treinos", [1, 2, 4, 5])).toBe("Treinos: subindo, de 1 a 5 (mínimo 1, máximo 5).");
    expect(sparklineLabel("Treinos", [])).toBe("Treinos: sem dados.");
  });

  it("states a progress as an amount, a total and a percentage", () => {
    const money = (v: number) => `R$ ${v}`;
    expect(progressLabel(150, 270, money)).toBe("R$ 150 de R$ 270 (56%)");
    expect(progressLabel(300, 270, money)).toBe("R$ 300 de R$ 270 (100%)");
    expect(progressLabel(0, 0, money)).toBe("R$ 0 de R$ 0");
  });

  it("states a stacked bar with every segment's count", () => {
    expect(stackedBarLabel("Mensalidades", [{ name: "Em atraso", count: 2 }, { name: "Em dia", count: 1 }])).toBe("Mensalidades: Em atraso 2, Em dia 1.");
    expect(stackedBarLabel("Mensalidades", [])).toBe("Mensalidades: nenhum personal.");
  });
});

describe("compactReais", () => {
  it("writes whole reais, then thousands", () => {
    expect(compactReais(0)).toBe("0");
    expect(compactReais(15000)).toBe("150");
    expect(compactReais(130000)).toBe("1,3 mil");
    expect(compactReais(1000000)).toBe("10 mil");
  });
});

describe("progressRatio / sparkPoints", () => {
  it("clamps the ratio and survives a zero total", () => {
    expect(progressRatio(1, 4)).toBe(0.25);
    expect(progressRatio(9, 4)).toBe(1);
    expect(progressRatio(-1, 4)).toBe(0);
    expect(progressRatio(1, 0)).toBe(0);
  });

  it("puts the first point at x=0 and the last at x=100, the maximum at the top and the minimum at the bottom", () => {
    expect(sparkPoints([0, 10], 28, 2)).toBe("0,26 100,2");
  });

  it("draws a flat series as a line through the middle, and one point in the centre", () => {
    expect(sparkPoints([3, 3, 3], 28)).toBe("0,14 50,14 100,14");
    expect(sparkPoints([4], 28)).toBe("50,14");
    expect(sparkPoints([])).toBe("");
  });
});
