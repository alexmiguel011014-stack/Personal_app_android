import { describe, expect, it } from "vitest";
import { agendaHourNumber, dayMonthLong, hourIn, longDate, shortDate } from "./dateLabels";

describe("dateLabels", () => {
  it("writes the long date the way the template's heading does", () => {
    expect(longDate("2026-09-29")).toBe("Terça-feira, 29 de setembro de 2026");
    expect(dayMonthLong("2026-09-26")).toBe("Sábado, 26 de setembro");
  });

  it("abbreviates a day as day and month", () => {
    expect(shortDate("2026-09-28")).toBe("28 set");
    expect(shortDate("2026-10-04")).toBe("04 out");
    expect(shortDate("2027-01-01")).toBe("01 jan");
  });

  it("reads the hour in the trainer's zone, not the machine's", () => {
    // 2026-09-29T11:30:00Z is 08:30 in São Paulo (UTC-3) and 20:30 in Tokyo (UTC+9).
    const instant = Date.UTC(2026, 8, 29, 11, 30);
    expect(hourIn(instant, "America/Sao_Paulo")).toBe(8);
    expect(hourIn(instant, "Asia/Tokyo")).toBe(20);
    // Midnight is 0, never 24.
    expect(hourIn(Date.UTC(2026, 8, 29, 3, 5), "America/Sao_Paulo")).toBe(0);
  });

  it("turns the phone's agenda hours into numbers", () => {
    expect(agendaHourNumber("06h")).toBe(6);
    expect(agendaHourNumber("21h")).toBe(21);
    expect(agendaHourNumber("6")).toBeNaN();
  });
});
