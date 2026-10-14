import { addDays, weekdayOf, yearMonth } from "./dates";
import { AGENDA_DAYS } from "./schedules";

// GOALS.md §38f: "Esta semana" on the aluno's home — seven days (Seg–Dom) with the ones they trained marked, and how
// many days they trained this week and this month. A "treino" here is a day with at least one log, the same definition as
// everywhere else (`trainedDays`, GOALS.md §23c). No clock: `today` is an argument.

export type DayState = "done" | "missed" | "today" | "future";

export interface WeekDay {
  /** "YYYY-MM-DD". */
  date: string;
  /** "Seg", "Ter", … */
  label: string;
  trained: boolean;
  isToday: boolean;
  /** done: trained; today: today and not trained yet; missed: a past day without training; future: still ahead. */
  state: DayState;
}

export interface WeekSummary {
  days: WeekDay[];
  /** Days trained from Monday to Sunday of this week. */
  thisWeek: number;
  /** Days trained in today's calendar month (up to today). */
  thisMonth: number;
}

/** The Monday of the week that holds `date`. */
export function mondayOf(date: string): string {
  return addDays(date, -AGENDA_DAYS.indexOf(weekdayOf(date)));
}

/** `trained` is the set of local days with a log (the aluno's own `trainedDays` entry). */
export function weekSummary(
  trained: ReadonlySet<string>,
  today: string,
): WeekSummary {
  const monday = mondayOf(today);
  const days: WeekDay[] = AGENDA_DAYS.map((name, index) => {
    const date = addDays(monday, index);
    const isTrained = trained.has(date);
    const state: DayState = isTrained
      ? "done"
      : date === today
        ? "today"
        : date < today
          ? "missed"
          : "future";
    return {
      date,
      label: name.slice(0, 3),
      trained: isTrained,
      isToday: date === today,
      state,
    };
  });
  const month = yearMonth(today);
  let thisMonth = 0;
  for (const date of trained)
    if (yearMonth(date) === month && date <= today) thisMonth++;
  return {
    days,
    thisWeek: days.filter((day) => day.trained).length,
    thisMonth,
  };
}

/** "2 treinos esta semana · 5 no mês", with the singular where it belongs. */
export function weekSummaryText(summary: WeekSummary): string {
  const week = `${summary.thisWeek} ${summary.thisWeek === 1 ? "treino" : "treinos"} esta semana`;
  const month = `${summary.thisMonth} no mês`;
  return `${week} · ${month}`;
}
