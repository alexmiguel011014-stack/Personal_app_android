import type { Exercise } from "./exercise";
import { isKotlinBlank, kotlinTrim } from "./kotlin";

// GOALS.md §38d: the optional detail of a prescribed exercise — carga (`weight`), descanso (`restSeconds`) and
// observação (`notes`). All three already exist in `Exercise` and in the JSON the phone decodes; the web only learns to
// fill and show them. Blank means "not set" (`null`, key omitted when encoded), so a ficha saved without details is
// byte for byte what it was before.

export const MAX_REST_SECONDS = 600;
export const MAX_NOTES_LENGTH = 300;
export const MAX_WEIGHT_LENGTH = 40;

export type RestResult = { seconds: number | null } | { error: string };

/** The "Descanso (s)" field: blank → no rest; otherwise whole seconds from 0 to 600. */
export function parseRestText(text: string): RestResult {
  const trimmed = kotlinTrim(text);
  if (trimmed === "") return { seconds: null };
  if (!/^\d{1,3}$/.test(trimmed))
    return { error: "Use só números, em segundos (de 0 a 600)." };
  const seconds = Number(trimmed);
  if (seconds > MAX_REST_SECONDS)
    return { error: "O descanso vai até 600 segundos (10 minutos)." };
  return { seconds };
}

export function notesError(notes: string): string | null {
  return kotlinTrim(notes).length > MAX_NOTES_LENGTH
    ? `A observação aceita até ${MAX_NOTES_LENGTH} caracteres.`
    : null;
}

export function weightError(weight: string): string | null {
  return kotlinTrim(weight).length > MAX_WEIGHT_LENGTH
    ? `A carga aceita até ${MAX_WEIGHT_LENGTH} caracteres.`
    : null;
}

/** 45 → "45s"; 90 → "1:30"; 120 → "2:00". */
export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const rest = seconds % 60;
  return `${Math.floor(seconds / 60)}:${rest < 10 ? "0" : ""}${rest}`;
}

const LINK = /https?:\/\/[^\s<>"'`]+/gi;

/** Sentence punctuation after a link is not part of it; a ")" stays only while it closes a "(" inside the link. */
function withoutTrailingPunctuation(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    if (last === ")") {
      const body = url.slice(0, end);
      if (count(body, ")") > count(body, "(")) end -= 1;
      else break;
    } else if (".,;:!?'\"]}".includes(last)) end -= 1;
    else break;
  }
  return url.slice(0, end);
}

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * The http(s) links in a note, in order, without repeats. Anything else — `javascript:`, `data:`, `file:`, a bare
 * "www." — is not a link here, so a note can never turn into a script URL.
 */
export function linksIn(notes: string): string[] {
  const found: string[] = [];
  for (const match of notes.matchAll(LINK)) {
    const url = withoutTrailingPunctuation(match[0]);
    if (!isHttpUrl(url) || found.includes(url)) continue;
    found.push(url);
  }
  return found;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== ""
    );
  } catch {
    return false;
  }
}

/** What stops a ficha from being saved, as sentences that read after "o exercício N: ". */
export function detailErrors(exercise: Exercise): string[] {
  const errors: string[] = [];
  if (exercise.weight !== null) {
    const problem = weightError(exercise.weight);
    if (problem !== null) errors.push(lowerFirst(problem));
  }
  if (exercise.notes !== null) {
    const problem = notesError(exercise.notes);
    if (problem !== null) errors.push(lowerFirst(problem));
  }
  const rest = exercise.restSeconds;
  if (rest !== null && (!Number.isInteger(rest) || rest < 0 || rest > MAX_REST_SECONDS)) {
    errors.push("o descanso vai de 0 a 600 segundos.");
  }
  return errors;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Shown in the ficha editor when pasting an answer replaced exercises that carried details. */
export const DETAILS_DISCARDED_NOTE =
  "Os detalhes (carga, descanso e observação) dos exercícios substituídos foram descartados.";

export function hasDetails(exercise: Exercise): boolean {
  return (
    exercise.weight !== null ||
    exercise.restSeconds !== null ||
    exercise.notes !== null
  );
}

/** Whether replacing these exercises throws any detail away (the paste warning of the ficha editor). */
export function exercisesHaveDetails(exercises: readonly Exercise[]): boolean {
  return exercises.some(hasDetails);
}

/** Blank carga / observação are stored as "not set"; non-blank ones are trimmed. */
export function tidiedDetails(exercise: Exercise): Exercise {
  return {
    ...exercise,
    weight:
      exercise.weight === null || isKotlinBlank(exercise.weight)
        ? null
        : kotlinTrim(exercise.weight),
    notes:
      exercise.notes === null || isKotlinBlank(exercise.notes)
        ? null
        : kotlinTrim(exercise.notes),
  };
}

/** What the trainer's details say to the aluno, ready to print (GOALS.md §38d). */
export interface ExerciseSummary {
  /** "3x12 · 40kg · descanso 1:30" — without the exercise's name. */
  line: string;
  note: string | null;
  /** The first http(s) link in the note, if any. */
  videoUrl: string | null;
}

export function summarizeExercise(exercise: Exercise): ExerciseSummary {
  const parts = [`${exercise.sets}x${exercise.reps}`];
  if (exercise.weight !== null && !isKotlinBlank(exercise.weight))
    parts.push(kotlinTrim(exercise.weight));
  if (exercise.restSeconds !== null)
    parts.push(`descanso ${formatRest(exercise.restSeconds)}`);
  const note =
    exercise.notes !== null && !isKotlinBlank(exercise.notes)
      ? kotlinTrim(exercise.notes)
      : null;
  return {
    line: parts.join(" · "),
    note,
    videoUrl: note === null ? null : (linksIn(note)[0] ?? null),
  };
}
