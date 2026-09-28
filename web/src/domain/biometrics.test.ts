import { describe, expect, it } from "vitest";
import { formatBodyFat, formatKg, parseMeasurement } from "./biometrics";

describe("parseMeasurement — AddBiometricDialog's rule", () => {
  it("takes a weight, and body fat when there is one", () => {
    expect(parseMeasurement("72.5", "18")).toEqual({ weight: 72.5, bodyFat: 18 });
    expect(parseMeasurement(" 80 ", "")).toEqual({ weight: 80, bodyFat: 0 });
  });

  it("accepts a comma decimal, as the add-student form does", () => {
    expect(parseMeasurement("72,5", "18,2")).toEqual({ weight: 72.5, bodyFat: 18.2 });
  });

  it("refuses a weight that's missing, not a number, or not above zero", () => {
    for (const weight of ["", "abc", "0", "-3", "70kg", "NaN"]) {
      expect(parseMeasurement(weight, "")).toEqual({ error: "Informe o peso em kg, maior que zero." });
    }
  });

  it("refuses a body fat that isn't a number from 0 to 100 — the dialog would store 0 silently", () => {
    for (const bodyFat of ["abc", "-1", "101"]) {
      expect(parseMeasurement("70", bodyFat)).toEqual({ error: "% de gordura precisa ser um número de 0 a 100." });
    }
  });
});

describe("formatKg / formatBodyFat", () => {
  it("writes pt-BR decimals, and no body fat for 0", () => {
    expect(formatKg(72.5)).toBe("72,5 kg");
    expect(formatKg(80)).toBe("80 kg");
    expect(formatBodyFat(18.25)).toBe("18,25%");
    expect(formatBodyFat(0)).toBe("—");
  });
});
