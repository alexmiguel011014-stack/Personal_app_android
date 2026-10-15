import type { Assessment } from "./assessments";
import { DAY_MS } from "./readWindows";
import { effortLabel, type SessionFeedback } from "./sessionFeedback";
import { groupSessions } from "./sessions";
import type { WorkoutLogDoc } from "./metrics";

// GOALS.md §38i (U9): the header of an aluno's page for the personal — the last session with how it felt, and whether
// the anamnese is up to date. Pure: the page hands in what it already holds.

/** An anamnese older than this is "desatualizada" (D18: re-sent about every six months). */
export const ANAMNESIS_FRESH_DAYS = 180;

export type AnamnesisStatus =
  | { kind: "pending"; label: string }
  | { kind: "current"; label: string; since: number }
  | { kind: "outdated"; label: string; since: number }
  | { kind: "never"; label: string };

/**
 * "Anamnese: em dia · pendente · nunca enviada" (plus "desatualizada" when the last one is past six months).
 * `pending` is the open request on the aluno's profile; only an anamnese counts, a plain PAR-Q+ self-assessment does not.
 */
export function anamnesisStatus(assessments: readonly Assessment[], pending: boolean, now: number): AnamnesisStatus {
  if (pending) return { kind: "pending", label: "pendente" };
  const sent = assessments.filter((assessment) => assessment.anamnesis !== null).map((assessment) => assessment.submittedAt);
  if (sent.length === 0) return { kind: "never", label: "nunca enviada" };
  const since = Math.max(...sent);
  return now - since > ANAMNESIS_FRESH_DAYS * DAY_MS
    ? { kind: "outdated", label: "desatualizada", since }
    : { kind: "current", label: "em dia", since };
}

export interface LastSession {
  /** Local day, `YYYY-MM-DD`. */
  day: string;
  effort: string | null;
  pain: boolean;
}

/**
 * The newest session in `logs` with the effort and pain the aluno reported for it; falls back to `earlierLog` (the latest log
 * before the window, without feedback) when the window holds none; null when the aluno never trained.
 */
export function lastSession(
  logs: readonly WorkoutLogDoc[],
  feedback: readonly SessionFeedback[],
  earlierLog: WorkoutLogDoc | null,
  timeZone: string,
  localDay: (ms: number) => string,
): LastSession | null {
  const newest = groupSessions(logs, timeZone)[0];
  if (newest !== undefined) {
    const item = feedback.find((candidate) => candidate.studentId === newest.studentId && candidate.day === newest.day);
    return { day: newest.day, effort: effortLabel(item?.effort ?? null), pain: item?.pain ?? false };
  }
  return earlierLog === null ? null : { day: localDay(earlierLog.date), effort: null, pain: false };
}
