import type { Assessment } from "../../../domain/assessments";
import { flaggedQuestions } from "../../../domain/assessments";
import type { Biometric } from "../../../domain/biometrics";
import { localDate } from "../../../domain/dates";
import type { WorkoutLogDoc } from "../../../domain/metrics";
import { groupSessions } from "../../../domain/sessions";

// GOALS.md §23k: the ALLU template's "Registros" — a chronological book of what was actually done
// (sessions, measurements, self-assessments), newest day first. Future bookings are not here; they
// live in the agenda. Pure: the page loads the documents, this arranges them.

export type LedgerEntry =
  | {
      kind: "session";
      id: string;
      studentId: string;
      ms: number;
      /** The treinos the session was done under — Registros names them when it can (GOALS.md §38c, U10). */
      workoutIds: string[];
      exercises: { name: string; sets: string; note: string | null }[];
    }
  | { kind: "measurement"; id: string; studentId: string; ms: number; weight: number; bodyFat: number }
  | { kind: "assessment"; id: string; studentId: string; ms: number; flagged: number; anamnesis: boolean };

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

  // GOALS.md §38c: the grouping itself lives in domain/sessions.ts, shared with the "Atividade recente" lists.
  for (const session of groupSessions(logs, timeZone, studentId)) {
    add(session.day, {
      kind: "session",
      id: `sessao-${session.studentId}-${session.day}`,
      studentId: session.studentId,
      ms: session.ms,
      workoutIds: session.workoutIds,
      exercises: session.exercises,
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
      anamnesis: assessment.anamnesis !== null,
    });
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, entries]) => ({ date, entries: entries.sort((a, b) => b.ms - a.ms) }));
}
