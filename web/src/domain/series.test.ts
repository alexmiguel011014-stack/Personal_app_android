import { describe, expect, it } from "vitest";
import { delta, monthlyTotals, windowedCounts } from "./series";

describe("windowedCounts", () => {
  const today = "2026-10-12";

  it("returns every window, oldest first, the newest ending today", () => {
    const windows = windowedCounts([], today, 7, 3);
    expect(windows.map((w) => [w.from, w.to, w.count])).toEqual([
      ["2026-09-22", "2026-09-28", 0],
      ["2026-09-29", "2026-10-05", 0],
      ["2026-10-06", "2026-10-12", 0],
    ]);
  });

  it("counts a day on both edges of a window, repeated days each time, and ignores days outside", () => {
    const days = ["2026-10-06", "2026-10-12", "2026-10-12", "2026-10-05", "2026-10-13", "2026-09-01"];
    expect(windowedCounts(days, today, 7, 2).map((w) => w.count)).toEqual([1, 3]);
  });

  it("crosses a month and a year boundary without gaps", () => {
    const windows = windowedCounts(["2026-12-30", "2027-01-02"], "2027-01-03", 7, 2);
    expect(windows.map((w) => w.from)).toEqual(["2026-12-21", "2026-12-28"]);
    expect(windows.map((w) => w.count)).toEqual([0, 2]);
  });
});

describe("monthlyTotals", () => {
  const SP = "America/Sao_Paulo";

  it("returns every month, oldest first, empty ones as zero", () => {
    expect(monthlyTotals([], "2026-10-12", 4, SP)).toEqual([
      { month: "2026-07", cents: 0 },
      { month: "2026-08", cents: 0 },
      { month: "2026-09", cents: 0 },
      { month: "2026-10", cents: 0 },
    ]);
  });

  it("rolls over the year", () => {
    expect(monthlyTotals([], "2027-01-31", 3, SP).map((b) => b.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("puts a payment in the month it was made in the given zone", () => {
    // 23:30 on 31 Oct in São Paulo is already 1 Nov in UTC.
    const at = Date.parse("2026-10-31T23:30:00-03:00");
    const sp = monthlyTotals([{ at, cents: 5000 }], "2026-11-05", 2, SP);
    expect(sp.map((b) => b.cents)).toEqual([5000, 0]);
    const utc = monthlyTotals([{ at, cents: 5000 }], "2026-11-05", 2, "UTC");
    expect(utc.map((b) => b.cents)).toEqual([0, 5000]);
  });

  it("adds payments of one month and drops those before the first bucket", () => {
    const points = [
      { at: Date.parse("2026-10-02T10:00:00-03:00"), cents: 100 },
      { at: Date.parse("2026-10-20T10:00:00-03:00"), cents: 250 },
      { at: Date.parse("2025-01-20T10:00:00-03:00"), cents: 999 },
    ];
    expect(monthlyTotals(points, "2026-10-25", 2, SP).map((b) => b.cents)).toEqual([0, 350]);
  });
});

describe("delta", () => {
  it("reports direction and the absolute difference", () => {
    expect(delta(5, 3)).toEqual({ value: 2, direction: "up" });
    expect(delta(1, 4)).toEqual({ value: 3, direction: "down" });
    expect(delta(2, 2)).toEqual({ value: 0, direction: "same" });
  });
});
