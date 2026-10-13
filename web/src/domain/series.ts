import { addMonths, localDate, yearMonth, addDays } from "./dates";

// GOALS.md §37a — the series behind the dashboards' small charts, as pure functions: no clock (every "today" is an
// argument) and no zone but the one passed. A series always has every bucket, oldest first, empty ones as zero.

export interface CountWindow {
  /** First day of the window, "YYYY-MM-DD". */
  from: string;
  /** Last day of the window (the last window ends today). */
  to: string;
  count: number;
}

/**
 * `count` consecutive windows of `windowDays` days, the newest ending on `today`, oldest first. Rolling windows, not
 * calendar weeks, so the newest one is exactly the "last 7 days" figure the cards show beside it.
 */
export function windowedCounts(days: Iterable<string>, today: string, windowDays: number, count: number): CountWindow[] {
  const all = [...days];
  const windows: CountWindow[] = [];
  for (let index = count - 1; index >= 0; index--) {
    const to = addDays(today, -index * windowDays);
    const from = addDays(to, -(windowDays - 1));
    windows.push({ from, to, count: all.filter((day) => day >= from && day <= to).length });
  }
  return windows;
}

export interface MonthAmount {
  /** "YYYY-MM". */
  month: string;
  cents: number;
}

/** Amounts added up per calendar month in `timeZone`, the last `months` months ending with today's, oldest first. */
export function monthlyTotals(points: readonly { at: number; cents: number }[], today: string, months: number, timeZone: string): MonthAmount[] {
  const buckets: MonthAmount[] = [];
  for (let index = months - 1; index >= 0; index--) {
    buckets.push({ month: yearMonth(addMonths(`${yearMonth(today)}-01`, -index)), cents: 0 });
  }
  for (const point of points) {
    const bucket = buckets.find((candidate) => candidate.month === yearMonth(localDate(point.at, timeZone)));
    if (bucket) bucket.cents += point.cents;
  }
  return buckets;
}

export interface Delta {
  /** Absolute difference, always ≥ 0. */
  value: number;
  direction: "up" | "down" | "same";
}

export function delta(current: number, previous: number): Delta {
  const difference = current - previous;
  return { value: Math.abs(difference), direction: difference > 0 ? "up" : difference < 0 ? "down" : "same" };
}
