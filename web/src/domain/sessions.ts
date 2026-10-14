import { daysBetween, localDate } from "./dates";
import { decodePerformedSets } from "./exercise";
import type { WorkoutLogDoc } from "./metrics";
import { formatSets } from "./progression";

// GOALS.md §38c (U6, U10): a session as one thing. The apps write one workoutLogs document per exercise, each with its
// own timestamp; a session is one student's logs of one local day — the same definition the dashboard counts by
// (domain/metrics.ts) and the book of Registros shows. Screens that list "what was done" show sessions, not one row per
// exercise. Pure: no Firebase, no clock.

export interface SessionExercise {
  name: string;
  /** The sets as the screens show them ("31×12 · 33,5×10"); empty when none was readable. */
  sets: string;
  note: string | null;
}

export interface LoggedSession {
  /** `${studentId}|${day}`. */
  key: string;
  studentId: string;
  /** The local day, "YYYY-MM-DD". */
  day: string;
  /** Epoch ms of the session's last log. */
  ms: number;
  /** The treinos the exercises were done under, in the order first performed — normally one. */
  workoutIds: string[];
  /** In the order performed. */
  exercises: SessionExercise[];
  /** The documents behind it, in the order performed — what a correction or a deletion acts on. */
  logs: readonly WorkoutLogDoc[];
}

/** An aluno may correct or delete a session of the last seven days (today included); older history stays as the personal saw it. */
export const EDIT_WINDOW_DAYS = 7;

export function isEditableSession(day: string, today: string): boolean {
  const age = daysBetween(day, today);
  return age >= 0 && age < EDIT_WINDOW_DAYS;
}

/** Sessions, newest first. With `studentId`, only that student's. */
export function groupSessions(logs: readonly WorkoutLogDoc[], timeZone: string, studentId?: string): LoggedSession[] {
  const byKey = new Map<string, { day: string; logs: WorkoutLogDoc[] }>();
  for (const log of logs) {
    if (studentId !== undefined && log.studentId !== studentId) continue;
    const day = localDate(log.date, timeZone);
    const key = `${log.studentId}|${day}`;
    const session = byKey.get(key);
    if (session) session.logs.push(log);
    else byKey.set(key, { day, logs: [log] });
  }
  const sessions: LoggedSession[] = [];
  for (const [key, { day, logs: sessionLogs }] of byKey) {
    const ordered = [...sessionLogs].sort((a, b) => a.date - b.date);
    sessions.push({
      key,
      studentId: ordered[0].studentId,
      day,
      ms: ordered[ordered.length - 1].date,
      workoutIds: [...new Set(ordered.map((log) => log.workoutId))],
      exercises: ordered.map((log) => ({
        name: log.exerciseName,
        sets: formatSets(decodePerformedSets(log.performedSetsJson)),
        note: log.note && log.note.trim() !== "" ? log.note : null,
      })),
      logs: ordered,
    });
  }
  return sessions.sort((a, b) => b.ms - a.ms || (a.key < b.key ? -1 : 1));
}

/**
 * What to call a session: the names of the treinos it was done under ("Treino A", or "Treino A + Treino B"), or
 * "Treino removido" when none of them exists any more (the ficha was replaced or deleted). The logs keep only the
 * treino's id, so a name needs the list of treinos the reader can see.
 */
export function sessionTitle(session: Pick<LoggedSession, "workoutIds">, names: ReadonlyMap<string, string>): string {
  const known = session.workoutIds.map((id) => names.get(id)).filter((name): name is string => name !== undefined && name.trim() !== "");
  return known.length === 0 ? "Treino removido" : known.join(" + ");
}
