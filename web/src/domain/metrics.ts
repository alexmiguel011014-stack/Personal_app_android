import { addDays, datesBetween, localDate, weekdayOf, yearMonth } from "./dates";
import { monthTotals, paymentStatus, type Payment } from "./payments";
import { filterStudentsByPause, type Student } from "./students";

// GOALS.md §23c — the trainer dashboard's numbers, as pure functions over documents the caller has
// already loaded. No Firestore here (that's §23e), and no clock: every "today" is an argument, so
// the same inputs always produce the same answer.

/** Firestore `workoutLogs/{id}`, mirroring FirestoreMappers.kt. */
export interface WorkoutLogDoc {
  id: string;
  trainerId: string;
  studentId: string;
  workoutId: string;
  exerciseName: string;
  /** Epoch ms. */
  date: number;
  performedSetsJson: string;
  note: string | null;
}

/** studentId → the local dates that student trained on. */
export type TrainedDays = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * The definition of a "session": a local day with at least one log.
 *
 * Not a document count. The Kotlin app writes ONE workoutLogs document per EXERCISE
 * (StudentViewModel.logSession), each stamped with its own currentTimeMillis() inside the loop — a
 * six-exercise session is six documents with six different timestamps. Counting documents inflates
 * sessions six- to tenfold; grouping by exact timestamp, or by workoutId + timestamp, splits one
 * session into many. Grouping by student and local day is the only definition that holds.
 */
export function trainedDays(logs: readonly WorkoutLogDoc[], timeZone: string): TrainedDays {
  const byStudent = new Map<string, Set<string>>();
  for (const log of logs) {
    let days = byStudent.get(log.studentId);
    if (!days) {
      days = new Set();
      byStudent.set(log.studentId, days);
    }
    days.add(localDate(log.date, timeZone));
  }
  return byStudent;
}

export interface StudentCounts {
  total: number;
  linked: number;
  pending: number;
}

export function studentCounts(students: readonly Student[]): StudentCounts {
  const active = filterStudentsByPause(students);
  const linked = active.filter((student) => student.linked).length;
  return { total: active.length, linked, pending: active.length - linked };
}

/** Sessions (student × trained day) between `from` and `to`, both inclusive. */
export function sessionsBetween(trained: TrainedDays, from: string, to: string): number {
  let sessions = 0;
  for (const days of trained.values()) {
    for (const day of days) if (day >= from && day <= to) sessions++;
  }
  return sessions;
}

export interface Adherence {
  /** Planned training days in the window. */
  expected: number;
  /** Days actually trained in the window, planned or not. */
  done: number;
  /** min(done, expected) / expected — extra days never push it past 100%. */
  ratio: number;
}

/**
 * How much of their plan a student trained between `from` and `to`.
 *
 * The plan is users.trainingDays, not schedules: every student has trainingDays, while a schedule
 * only exists for students with in-person appointments. `done` counts every trained day, planned
 * or not — a student who swaps Monday for Tuesday still trained as much as planned, which is what
 * the trainer is asking. The window starts no earlier than the day the student joined, so someone
 * linked three days ago isn't scored against four weeks they weren't around for.
 *
 * Null for drafts (they can't log anything yet) and for students with no plan in the window.
 */
export function adherence(
  student: Student,
  trained: TrainedDays,
  from: string,
  to: string,
  timeZone: string,
): Adherence | null {
  if (!student.linked || student.paused) return null;
  const joined = localDate(student.createdAt, timeZone);
  const window = datesBetween(joined > from ? joined : from, to);
  // NFC so a decomposed "Terça" (c + combining cedilla) still matches.
  const plan = new Set(student.trainingDays.map((day) => day.normalize("NFC")));
  const expected = window.filter((date) => plan.has(weekdayOf(date))).length;
  if (expected === 0) return null;
  const days = trained.get(student.id);
  const done = days ? window.filter((date) => days.has(date)).length : 0;
  return { expected, done, ratio: Math.min(done, expected) / expected };
}

/** Pooled across students: Σ min(done, expected) / Σ expected. Null when nobody has a plan. */
export function overallAdherence(
  students: readonly Student[],
  trained: TrainedDays,
  from: string,
  to: string,
  timeZone: string,
): number | null {
  let expected = 0;
  let done = 0;
  for (const student of students) {
    const result = adherence(student, trained, from, to, timeZone);
    if (!result) continue;
    expected += result.expected;
    done += Math.min(result.done, result.expected);
  }
  return expected === 0 ? null : done / expected;
}

export interface QuietStudent {
  student: Student;
  /** Last trained day, or null if they never trained. */
  lastTrained: string | null;
}

/**
 * Linked students with no trained day in the last `days` days, today included — TrueCoach sells
 * this as "Automated Risk Assessment"; here it falls out of data the app already has.
 *
 * Drafts are left out: they can't log anything, and they already read as "aguardando conexão". So
 * is anyone who joined inside the window — a quiet first week isn't a warning sign. Never-trained
 * students come first, then the longest silence.
 */
export function quietStudents(
  students: readonly Student[],
  trained: TrainedDays,
  today: string,
  days: number,
  timeZone: string,
): QuietStudent[] {
  const windowStart = addDays(today, -(days - 1));
  const quiet: QuietStudent[] = [];
  for (const student of students) {
    if (!student.linked || student.paused) continue;
    if (localDate(student.createdAt, timeZone) > windowStart) continue;
    let lastTrained: string | null = null;
    for (const day of trained.get(student.id) ?? []) {
      if (day <= today && (lastTrained === null || day > lastTrained)) lastTrained = day;
    }
    if (lastTrained === null || lastTrained < windowStart) quiet.push({ student, lastTrained });
  }
  return quiet.sort((a, b) => (a.lastTrained ?? "").localeCompare(b.lastTrained ?? ""));
}

export function pendingAssessments(students: readonly Student[]): Student[] {
  return students.filter((student) => student.linked && !student.paused && student.pendingAssessmentRequest);
}

export interface PaymentSummary {
  /** Charges due this calendar month, paid or not. */
  expectedCents: number;
  /** Charges paid this calendar month, whatever month they were due in. */
  receivedCents: number;
  /** Unpaid charges past their due date, from any month — oldest first. */
  overdue: Payment[];
  overdueCents: number;
}

export function paymentSummary(
  payments: readonly Payment[],
  today: string,
  timeZone: string,
): PaymentSummary {
  const { expectedCents, receivedCents } = monthTotals(payments, yearMonth(today), timeZone);
  const overdue = overdueCharges(payments, today);
  const overdueCents = overdue.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { expectedCents, receivedCents, overdue, overdueCents };
}

/** Unpaid charges past their due date, from any month — oldest first. */
export function overdueCharges(payments: readonly Payment[], today: string): Payment[] {
  return payments
    .filter((payment) => paymentStatus(payment, today) === "overdue")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
