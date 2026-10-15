// GOALS.md §38h (D3–D5): how a session went, said by the aluno, and the personal's answer. One document per session
// (aluno × local day, fact 1) holding both sides; each side writes only its own fields. Pure: no Firestore, no clock.

export interface SessionFeedback {
  studentId: string;
  trainerId: string;
  /** The local day of the session, `YYYY-MM-DD`. */
  day: string;
  /** Session RPE on the CR-10 scale (D4), or null when the aluno skipped the question. */
  effort: number | null;
  pain: boolean;
  studentComment: string;
  studentAt: number | null;
  /** When the aluno opened the personal's comment. */
  studentSeenAt: number | null;
  trainerComment: string;
  trainerAt: number | null;
  /** When the personal marked the session as seen. */
  trainerSeenAt: number | null;
}

export const STUDENT_COMMENT_MAX = 500;
export const TRAINER_COMMENT_MAX = 1000;

/** D4: the five words the aluno chooses from, each standing for a CR-10 value. */
export const EFFORT_CHOICES: readonly { value: number; label: string }[] = [
  { value: 2, label: "Muito leve" },
  { value: 4, label: "Leve" },
  { value: 6, label: "Moderado" },
  { value: 8, label: "Pesado" },
  { value: 10, label: "Máximo" },
];

/** The word for a stored effort; a value off the five (a 5 typed elsewhere) reads as the nearest word at or below it. */
export function effortLabel(effort: number | null): string | null {
  if (effort === null || !Number.isInteger(effort) || effort < 0 || effort > 10) return null;
  const choice = [...EFFORT_CHOICES].reverse().find((candidate) => candidate.value <= effort);
  return choice?.label ?? EFFORT_CHOICES[0].label;
}

/** `{studentId}_{YYYY-MM-DD}` — what firestore.rules check the document id against. */
export function sessionFeedbackId(studentId: string, day: string): string {
  return `${studentId}_${day}`;
}

// Any control character, tab and line breaks included except the newline a comment may hold.
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;

/** Trims a comment; null when it holds a control character or passes `max` (the Rules cap the same). */
export function tidyComment(text: string, max: number): string | null {
  const trimmed = text.trim();
  if (trimmed.length > max || CONTROL.test(trimmed)) return null;
  return trimmed;
}

export type FeedbackProblem = "effort" | "comment";

/** What the aluno sends: a problem key when something is not acceptable, otherwise the tidied values. */
export function checkStudentInput(input: { effort: number | null; comment: string }):
  | { ok: true; effort: number | null; comment: string }
  | { ok: false; problem: FeedbackProblem } {
  if (input.effort !== null && (!Number.isInteger(input.effort) || input.effort < 0 || input.effort > 10)) return { ok: false, problem: "effort" };
  const comment = tidyComment(input.comment, STUDENT_COMMENT_MAX);
  if (comment === null) return { ok: false, problem: "comment" };
  return { ok: true, effort: input.effort, comment };
}

/** The personal's comment, tidied; null when it is not acceptable. */
export function checkTrainerComment(text: string): string | null {
  return tidyComment(text, TRAINER_COMMENT_MAX);
}

/** The aluno said something (effort, pain or a comment) the personal has not marked as seen yet. */
export function isUnseenByTrainer(feedback: SessionFeedback): boolean {
  return feedback.studentAt !== null && feedback.trainerSeenAt === null;
}

/** The personal wrote a comment the aluno has not opened yet. */
export function hasUnreadTrainerComment(feedback: SessionFeedback): boolean {
  return feedback.trainerComment !== "" && feedback.trainerAt !== null && feedback.studentSeenAt === null;
}

/** The aluno reported pain and the personal has not looked at it. */
export function isUnseenPain(feedback: SessionFeedback): boolean {
  return feedback.pain && isUnseenByTrainer(feedback);
}

/** A feedback with nothing the aluno said: skipped, no pain, no comment. */
export function isEmptyStudentSide(effort: number | null, pain: boolean, comment: string): boolean {
  return effort === null && !pain && comment === "";
}

/** `${studentId}|${day}` — the same key `groupSessions` gives a session, so a session finds its feedback. */
export function feedbackKey(studentId: string, day: string): string {
  return `${studentId}|${day}`;
}

export function indexFeedback(feedback: readonly SessionFeedback[]): Map<string, SessionFeedback> {
  return new Map(feedback.map((item) => [feedbackKey(item.studentId, item.day), item]));
}

/** An empty document for a session nobody has answered yet — what the personal's first "visto" starts from. */
export function blankFeedback(studentId: string, trainerId: string, day: string): SessionFeedback {
  return {
    studentId, trainerId, day, effort: null, pain: false, studentComment: "", studentAt: null, studentSeenAt: null,
    trainerComment: "", trainerAt: null, trainerSeenAt: null,
  };
}

/**
 * What the screen shows right after the personal's write, before any read: their fields with the device's clock.
 * The stored values carry the server's time; the next load replaces these.
 */
export function withTrainerResponse(
  current: SessionFeedback,
  response: { seen?: boolean; comment?: string },
  now: number,
): SessionFeedback {
  return {
    ...current,
    trainerSeenAt: response.seen ? now : current.trainerSeenAt,
    ...(response.comment !== undefined && response.comment !== "" ? { trainerComment: response.comment, trainerAt: now } : {}),
  };
}

/** The same for the aluno's "I read it". */
export function withStudentSeen(current: SessionFeedback, now: number): SessionFeedback {
  return { ...current, studentSeenAt: now };
}
