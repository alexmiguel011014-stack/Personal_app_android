// Display labels for the ALLU template's headings ("Terça-feira, 29 de setembro de 2026", "28 set").
// Presentation only: the rules about which day is which live in src/domain/dates.ts. Dates are the
// "YYYY-MM-DD" strings the domain uses, read as calendar days — never shifted by a time zone.

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** "2026-09-29" as "Terça-feira, 29 de setembro de 2026". */
export function longDate(date: string): string {
  return upperFirst(
    new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      utc(date),
    ),
  );
}

/** "2026-09-26" as "Sábado, 26 de setembro". */
export function dayMonthLong(date: string): string {
  return upperFirst(
    new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(utc(date)),
  );
}

/** "2026-09-28" as "28 set". */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day} ${MONTHS_SHORT[Number(month) - 1]}`;
}

/** The wall-clock hour (0-23) of the instant `ms` in `timeZone`. */
export function hourIn(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).formatToParts(ms);
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0);
}

/** An agenda hour as the phone stores it ("08h") as a number; NaN if it is something else. */
export function agendaHourNumber(hour: string): number {
  return /^\d{2}h$/.test(hour) ? Number(hour.slice(0, 2)) : Number.NaN;
}
