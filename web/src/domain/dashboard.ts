import { addDays } from "./dates";
import {
  overallAdherence,
  paymentSummary,
  pendingAssessments,
  quietStudents,
  sessionsBetween,
  studentCounts,
  trainedDays,
  type PaymentSummary,
  type QuietStudent,
  type StudentCounts,
  type WorkoutLogDoc,
} from "./metrics";
import type { Payment } from "./payments";
import type { Student } from "./students";

// GOALS.md §23g: the trainer's home screen, computed with the windows §23c settled on (and the
// reasons are there): a rolling week for sessions, four weeks for adherence, a week of silence
// before someone counts as gone quiet.

export const SESSIONS_WINDOW_DAYS = 7;
export const ADHERENCE_WINDOW_DAYS = 28;
export const QUIET_AFTER_DAYS = 7;

export interface DashboardFigures {
  students: StudentCounts;
  sessions: number;
  /** null when no student has a training plan to measure against. */
  adherence: number | null;
  quiet: QuietStudent[];
  pendingAssessments: Student[];
  payments: PaymentSummary;
}

export interface DashboardInput {
  students: readonly Student[];
  logs: readonly WorkoutLogDoc[];
  payments: readonly Payment[];
}

export function dashboardFigures(input: DashboardInput, today: string, timeZone: string): DashboardFigures {
  const trained = trainedDays(input.logs, timeZone);
  return {
    students: studentCounts(input.students),
    sessions: sessionsBetween(trained, addDays(today, -(SESSIONS_WINDOW_DAYS - 1)), today),
    adherence: overallAdherence(input.students, trained, addDays(today, -(ADHERENCE_WINDOW_DAYS - 1)), today, timeZone),
    quiet: quietStudents(input.students, trained, today, QUIET_AFTER_DAYS, timeZone),
    pendingAssessments: pendingAssessments(input.students),
    payments: paymentSummary(input.payments, today, timeZone),
  };
}
