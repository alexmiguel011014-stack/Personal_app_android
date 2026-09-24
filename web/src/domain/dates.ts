// GOALS.md §23c: calendar dates are "YYYY-MM-DD" strings in the trainer's time zone — never a Date,
// never an instant. Instants (createdAt, paidAt, a workout log's date) are epoch milliseconds, the
// convention the Kotlin side already uses (FirestoreMappers.kt stores every one of them as a Long).
//
// Every function takes the zone explicitly, so nothing depends on the machine running it: a test
// runner in UTC and a browser in São Paulo must agree on which day a 22:30 log belongs to.

export const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

// Indexed like Date#getUTCDay (0 = Sunday). These are exactly the strings the Kotlin UI writes into
// users.trainingDays and schedules.dayOfWeek — accented and capitalised, so matching is exact.
export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The wall-clock date of the instant `ms` in `timeZone`, as "YYYY-MM-DD". */
export function localDate(ms: number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = formatterFor(timeZone).formatToParts(ms);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** "YYYY-MM" of a "YYYY-MM-DD" date. */
export function yearMonth(date: string): string {
  return date.slice(0, 7);
}

// Pure calendar arithmetic, done in UTC so no offset or DST rule can move the result.
function utcMidnight(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: string, days: number): string {
  return new Date(utcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): Weekday {
  return WEEKDAYS[new Date(utcMidnight(date)).getUTCDay()];
}

export function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-09-10" as "10/09/2026", the way the trainer reads a date. */
export function formatDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** "2026-09" as "setembro de 2026". */
export function formatYearMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    Date.UTC(year, month - 1, 1),
  );
}

/** Every date from `from` to `to`, both inclusive; empty when `from` is after `to`. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}
