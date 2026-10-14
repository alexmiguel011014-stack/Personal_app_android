import { WEEKDAYS } from "./dates";

// GOALS.md §23g: a weekly appointment — Firestore `schedules/{id}`, mirroring ScheduleEntity: a
// student, a weekday ("Segunda") and an hour ("08h"). Not dated: the phone's agenda is a template
// of the week, the same every week.

export interface Schedule {
  id: string;
  trainerId: string;
  studentId: string;
  dayOfWeek: string;
  hour: string;
}

/** ScheduleScreen's days, Monday first — the same strings the phone stores. */
export const AGENDA_DAYS: readonly string[] = [...WEEKDAYS.slice(1), WEEKDAYS[0]];

/** DayAgendaItem's slots: "06h" to "21h". */
export const AGENDA_HOURS: readonly string[] = Array.from({ length: 16 }, (_, i) => `${String(i + 6).padStart(2, "0")}h`);

/**
 * The bookings in one slot. The phone books one student per slot and shows only the first it
 * finds; two tabs or two devices can still book the same slot at once, so here every one shows —
 * nothing hides, and the extra one can be removed.
 */
export function bookingsAt(schedules: readonly Schedule[], day: string, hour: string): Schedule[] {
  return schedules.filter((schedule) => schedule.dayOfWeek === day && schedule.hour === hour);
}

/** Bookings on one weekday — the phone's "N agendados" badge. */
export function bookingsOn(schedules: readonly Schedule[], day: string): number {
  return schedules.filter((schedule) => schedule.dayOfWeek === day).length;
}

/** "07h" → "07:00"; anything not in that shape is shown as stored. */
export function hourClock(hour: string): string {
  const match = /^(\d{2})h$/.exec(hour);
  return match ? `${match[1]}:00` : hour;
}

/**
 * The aluno's own weekly appointments as lines, earliest hour first, the days of one hour grouped in week order:
 * "Seg, Qua, Sex · 07:00" (GOALS.md §38f). Empty when they have none.
 */
export function scheduleLines(schedules: readonly Schedule[]): string[] {
  const byHour = new Map<string, Set<string>>();
  for (const schedule of schedules) {
    const days = byHour.get(schedule.hour) ?? new Set<string>();
    days.add(schedule.dayOfWeek);
    byHour.set(schedule.hour, days);
  }
  const rank = (day: string) => {
    const index = AGENDA_DAYS.indexOf(day);
    return index === -1 ? AGENDA_DAYS.length : index;
  };
  return [...byHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, days]) => `${[...days].sort((a, b) => rank(a) - rank(b)).map((day) => day.slice(0, 3)).join(", ")} · ${hourClock(hour)}`);
}
