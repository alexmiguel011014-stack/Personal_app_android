import type { WorkoutLogDoc } from "./metrics";
import type { Student } from "./students";

// GOALS.md §38b: how much history each screen reads. The Spark plan bills every document returned and gives the
// whole project 50,000 reads a day, and workoutLogs grow by one document per exercise per session (≈ 18,700 a year
// for a personal with 20 alunos) — so screens read a window of recent logs, plus the little they need from before
// it, and the full history only when someone asks for it. Pure: no Firestore, no clock.

export const DAY_MS = 86_400_000;

/**
 * The personal's screens read this many days of workoutLogs. It covers every figure on "Hoje" — the 7-day sessions,
 * the 28-day adherence and, for §37's dashboard, eight weekly bars and the 28 days before the current adherence
 * window (56 days) — with a week to spare for the time zone and the week boundary.
 */
export const TRAINER_LOG_WINDOW_DAYS = 63;

/** The aluno's own screens read this many days of their logs; "Evolução" loads the rest on request. */
export const STUDENT_LOG_WINDOW_DAYS = 60;

/**
 * A refresh later in the same session reads again only the logs this recent: an aluno may still correct or delete
 * a session of the last seven days (GOALS.md §38, D12), older ones no longer change.
 */
export const REFRESH_OVERLAP_DAYS = 8;

/** A loaded snapshot younger than this is reused by the next page instead of being read again. */
export const CACHE_TTL_MS = 5 * 60_000;

/** The first instant (epoch ms) of a window of `days` days ending at `now`. */
export function windowStart(now: number, days: number): number {
  return now - days * DAY_MS;
}

/** Where a refresh starts reading logs: the overlap before the previous load, never before the window. */
export function refreshStart(previousLoadedAt: number, now: number, from: number): number {
  return Math.max(from, Math.min(previousLoadedAt, now) - REFRESH_OVERLAP_DAYS * DAY_MS);
}

/**
 * A refreshed slice laid over a cached window: cached logs older than `refetchedFrom` stay (unless the window has
 * moved past them), and everything from `refetchedFrom` on is exactly what was just read — so a log deleted or
 * corrected in that span disappears or changes, and a new one appears.
 */
export function mergeLogWindow(
  cached: readonly WorkoutLogDoc[],
  refetched: readonly WorkoutLogDoc[],
  refetchedFrom: number,
  from: number,
): WorkoutLogDoc[] {
  return [...cached.filter((log) => log.date >= from && log.date < refetchedFrom), ...refetched];
}

/**
 * The alunos whose last training day lies before the window, so one `limit(1)` query each must find it: linked and
 * not paused (the only ones "Hoje" scores), connected before the window began (nobody logs before having an
 * account), and with no log inside the window. Without it a quiet aluno would read as "nunca registrou treino".
 */
export function studentsNeedingEarlierLog(
  students: readonly Student[],
  logs: readonly WorkoutLogDoc[],
  from: number,
): string[] {
  const inWindow = new Set(logs.filter((log) => log.date >= from).map((log) => log.studentId));
  return students
    .filter((student) => student.linked && !student.paused && student.createdAt < from && !inWindow.has(student.id))
    .map((student) => student.id);
}

/** Each student's latest log before `from`, from a full list — the reference the windowed load must agree with. */
export function latestLogsBefore(logs: readonly WorkoutLogDoc[], studentIds: readonly string[], from: number): WorkoutLogDoc[] {
  const wanted = new Set(studentIds);
  const latest = new Map<string, WorkoutLogDoc>();
  for (const log of logs) {
    if (!wanted.has(log.studentId) || log.date >= from) continue;
    const current = latest.get(log.studentId);
    if (!current || log.date > current.date) latest.set(log.studentId, log);
  }
  return [...latest.values()];
}
