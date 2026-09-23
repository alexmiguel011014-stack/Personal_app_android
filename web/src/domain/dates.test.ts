import { describe, expect, it } from "vitest";
import { WEEKDAYS, addDays, datesBetween, daysInMonth, localDate, weekdayOf } from "./dates";

describe("localDate", () => {
  it("uses the given zone, not UTC: 01:30Z on the 1st is still the 30th in São Paulo", () => {
    const instant = Date.parse("2026-10-01T01:30:00Z");
    expect(localDate(instant, "America/Sao_Paulo")).toBe("2026-09-30");
    expect(localDate(instant, "UTC")).toBe("2026-10-01");
  });
});

describe("addDays", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-09-22", -27)).toBe("2026-08-26");
  });
});

describe("weekdayOf", () => {
  it("names days the way users.trainingDays stores them", () => {
    expect(weekdayOf("2026-09-22")).toBe("Terça");
    expect(weekdayOf("2026-09-26")).toBe("Sábado");
    expect(weekdayOf("2026-09-27")).toBe("Domingo");
  });

  it("uses the same seven strings as the Kotlin screens' daysOfWeek lists", () => {
    // Copied from the Kotlin UI. Guards this side against a typo such as "Terca" — a drift on the
    // Kotlin side would not be caught here.
    const kotlin = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
    expect([...WEEKDAYS].sort()).toEqual([...kotlin].sort());
  });
});

describe("daysInMonth", () => {
  it("knows February and leap years", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-09")).toBe(30);
  });
});

describe("datesBetween", () => {
  it("is inclusive on both ends and empty when reversed", () => {
    expect(datesBetween("2026-09-20", "2026-09-22")).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    expect(datesBetween("2026-09-22", "2026-09-20")).toEqual([]);
  });
});
