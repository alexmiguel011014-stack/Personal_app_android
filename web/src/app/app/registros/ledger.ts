import type { Assessment } from "../../../domain/assessments";
import { flaggedQuestions } from "../../../domain/assessments";
import type { Biometric } from "../../../domain/biometrics";
import { localDate } from "../../../domain/dates";
import { decodePerformedSets } from "../../../domain/exercise";
import type { WorkoutLogDoc } from "../../../domain/metrics";
import { formatSets } from "../../../domain/progression";

// GOALS.md §23k: the ALLU template's "Registros" — a chronological book of what was actually done
// (sessions, measurements, self-assessments), newest day first. Future bookings are not here; they
// live in the agenda. Pure: the page loads the documents, this arranges them.

export type LedgerEntry =
  | {
      kind: "session";
      id: string;
      studentId: string;
      ms: number;
      exercises: { name: string; sets: string; note: string | null }[];
    }
  | { kind: "measurement"; id: string; studentId: string; ms: number; weight: number; bodyFat: number }
  | { kind: "assessment"; id: string; studentId: string; ms: number; flagged: number };

export interface LedgerDay {
  /** "YYYY-MM-DD" in the trainer's zone. */
  date: string;
  entries: LedgerEntry[];
}

/**
 * A session is one student's logs of one local day — the same definition the dashboard counts by
 * (domain/metrics.ts): the Kotlin app writes one document per exercise, each with its own timestamp,
 * so grouping by document would show a six-exercise session as six entries.
 */
export function buildLedger({
  logs,
  biometrics,
  assessments,
  timeZone,
  studentId,
}: {
  logs: readonly WorkoutLogDoc[];
  biometrics: readonly Biometric[];
  assessments: readonly Assessment[];
  timeZone: string;
  /** Only this student's entries; every student's when omitted. */
  studentId?: string;
}): LedgerDay[] {
  const mine = <T extends { studentId: string }>(items: readonly T[]) =>
    studentId === undefined ? items : items.filter((item) => item.studentId === studentId);
  const byDay = new Map<string, LedgerEntry[]>();
  const add = (date: string, entry: LedgerEntry) => {
    const day = byDay.get(date);
    if (day) day.push(entry);
    else byDay.set(date, [entry]);
  };

  const sessions = new Map<string, { date: string; logs: WorkoutLogDoc[] }>();
  for (const log of mine(logs)) {
    const date = localDate(log.date, timeZone);
    const key = `${log.studentId}|${date}`;
    const session = sessions.get(key);
    if (session) session.logs.push(log);
    else sessions.set(key, { date, logs: [log] });
  }
  for (const { date, logs: sessionLogs } of sessions.values()) {
    const ordered = [...sessionLogs].sort((a, b) => a.date - b.date);
    add(date, {
      kind: "session",
      id: `sessao-${ordered[0].studentId}-${date}`,
      studentId: ordered[0].studentId,
      ms: ordered[ordered.length - 1].date,
      exercises: ordered.map((log) => ({
        name: log.exerciseName,
        sets: formatSets(decodePerformedSets(log.performedSetsJson)),
        note: log.note && log.note.trim() !== "" ? log.note : null,
      })),
    });
  }
  for (const biometric of mine(biometrics)) {
    add(localDate(biometric.date, timeZone), {
      kind: "measurement",
      id: `medida-${biometric.id}`,
      studentId: biometric.studentId,
      ms: biometric.date,
      weight: biometric.weight,
      bodyFat: biometric.bodyFat,
    });
  }
  for (const assessment of mine(assessments)) {
    add(localDate(assessment.submittedAt, timeZone), {
      kind: "assessment",
      id: `autoavaliacao-${assessment.id}`,
      studentId: assessment.studentId,
      ms: assessment.submittedAt,
      flagged: flaggedQuestions(assessment).length,
    });
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, entries]) => ({ date, entries: entries.sort((a, b) => b.ms - a.ms) }));
}
