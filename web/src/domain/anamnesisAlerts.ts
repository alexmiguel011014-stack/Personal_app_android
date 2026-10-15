import { anamnesisFlags } from "./anamnesis";
import type { Assessment } from "./assessments";

// GOALS.md §38i: "Anamnese com ponto de atenção" on "Hoje" - a submitted anamnese with at least one flag that the personal
// has not opened yet. "Opened" is a per-device memory of report ids (localStorage, D7-style): nothing about it is written
// to Firestore, so the alert may reappear on another device, never the other way round. Pure.

export const OPENED_REPORTS_MAX = 200;
/** An anamnese older than this no longer raises an alert on "Hoje"; it stays on the aluno's page. */
export const ALERT_WINDOW_DAYS = 30;

export interface AnamnesisAlert {
  assessmentId: string;
  studentId: string;
  submittedAt: number;
  /** How many flags the anamnese has (PAR-Q+ "sim", conditions, pain, ...). */
  points: number;
}

/** The stored ids from `raw` (what localStorage returned), dropping anything that is not a list of strings. */
export function parseOpened(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-OPENED_REPORTS_MAX) : [];
  } catch {
    return [];
  }
}

/** `raw` with `id` added (newest last), the oldest dropped past the cap; the string to store. */
export function withOpened(raw: string | null, id: string): string {
  const ids = parseOpened(raw).filter((existing) => existing !== id);
  ids.push(id);
  return JSON.stringify(ids.slice(-OPENED_REPORTS_MAX));
}

/** Anamneses sent within the window that carry a flag and are not in `opened`, newest first. Plain PAR-Q+ self-assessments never alert here. */
export function unopenedFlaggedAnamneses(assessments: readonly Assessment[], opened: ReadonlySet<string>, now: number): AnamnesisAlert[] {
  const since = now - ALERT_WINDOW_DAYS * 86_400_000;
  return assessments
    .filter((assessment) => assessment.anamnesis !== null && assessment.submittedAt >= since && !opened.has(assessment.id))
    .map((assessment) => ({
      assessmentId: assessment.id,
      studentId: assessment.studentId,
      submittedAt: assessment.submittedAt,
      points: anamnesisFlags(assessment.parQAnswers, assessment.anamnesis).length,
    }))
    .filter((alert) => alert.points > 0)
    .sort((a, b) => b.submittedAt - a.submittedAt);
}
