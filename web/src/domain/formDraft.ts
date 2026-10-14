import type { SetRow } from "./sessionLog";

// GOALS.md §38c / D7: a form being filled in survives a reload, a discarded background tab or a locked phone — a
// per-device convenience kept in the browser's localStorage, never synced, never a Firestore write per keystroke.
// Everything here is pure or takes the storage as an argument, so it can be tested without a browser; every access is
// in try/catch because storage can be missing or throw (a private window, blocked site data, a full disk) and the
// form must then simply work without a draft.

export const DRAFT_VERSION = 1;
export const LOG_DRAFT_MAX_AGE_MS = 24 * 3_600_000;
export const ANAMNESIS_DRAFT_MAX_AGE_MS = 7 * 24 * 3_600_000;
/** A draft stamped further in the future than this is from a clock that was wrong: it is not trusted. */
const CLOCK_SKEW_MS = 60_000;

/** The part of `Storage` the drafts use — `window.localStorage` fits, and so does a test double. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One key per form, person and (for the log form) treino: another treino's draft is never offered. */
export function draftKey(kind: "log" | "anamnese", uid: string, scope = ""): string {
  return `allu:draft:${kind}:${uid}${scope === "" ? "" : `:${scope}`}`;
}

export function serializeDraft(data: unknown, now: number): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now, data });
}

export interface ParsedDraft<T> {
  data: T;
  /** Epoch ms the draft was last saved. */
  savedAt: number;
}

/**
 * The draft in `raw`, or null: nothing stored, not JSON, another version, too old, from the future, or whose data
 * `validate` does not accept (it returns the cleaned data, or null).
 */
export function parseDraft<T>(
  raw: string | null | undefined,
  now: number,
  maxAgeMs: number,
  validate: (data: unknown) => T | null,
): ParsedDraft<T> | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, savedAt, data } = parsed as { v?: unknown; savedAt?: unknown; data?: unknown };
  if (v !== DRAFT_VERSION || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  if (now - savedAt > maxAgeMs || savedAt - now > CLOCK_SKEW_MS) return null;
  const cleaned = validate(data);
  return cleaned === null ? null : { data: cleaned, savedAt };
}

export function readDraft<T>(
  storage: StorageLike | null,
  key: string,
  now: number,
  maxAgeMs: number,
  validate: (data: unknown) => T | null,
): ParsedDraft<T> | null {
  if (storage === null) return null;
  try {
    return parseDraft(storage.getItem(key), now, maxAgeMs, validate);
  } catch {
    return null;
  }
}

export function writeDraft(storage: StorageLike | null, key: string, data: unknown, now: number): void {
  if (storage === null) return;
  try {
    storage.setItem(key, serializeDraft(data, now));
  } catch {
    // Storage full or blocked: the form keeps working, it just will not survive a reload.
  }
}

export function removeDraft(storage: StorageLike | null, key: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing to do: there was no draft we could reach.
  }
}

// ---------- the log form's draft ----------

const MAX_EXERCISES = 60;
const MAX_ROWS = 30;
const MAX_CELL = 40;

export type LogDraftRows = Record<string, SetRow[]>;

/** The rows a log form holds, validated: an object of exercise name → rows of two short strings, nothing else. */
export function validateLogDraft(data: unknown): LogDraftRows | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length > MAX_EXERCISES) return null;
  const rows: LogDraftRows = {};
  for (const [name, list] of entries) {
    if (!Array.isArray(list) || list.length > MAX_ROWS) return null;
    const cleaned: SetRow[] = [];
    for (const row of list) {
      if (typeof row !== "object" || row === null) return null;
      const { weight, reps } = row as { weight?: unknown; reps?: unknown };
      if (typeof weight !== "string" || typeof reps !== "string") return null;
      if (weight.length > MAX_CELL || reps.length > MAX_CELL) return null;
      cleaned.push({ weight, reps });
    }
    rows[name] = cleaned;
  }
  return rows;
}

/** Whether anything was typed — an untouched form is not worth a draft. */
export function logDraftHasContent(rows: LogDraftRows | ReadonlyMap<string, readonly SetRow[]>): boolean {
  const lists: (readonly SetRow[])[] = rows instanceof Map ? [...rows.values()] : Object.values(rows);
  return lists.some((list) => list.some((row) => row.weight.trim() !== "" || row.reps.trim() !== ""));
}

/**
 * A saved draft laid over the rows the form starts with (`initial`: the prescription, one blank row per set): only
 * exercises the treino still has, never fewer rows than the prescription, and an extra row only when the aluno may
 * add sets (`canAddSets`) — a draft cannot grant more than the permission.
 */
export function applyLogDraft(
  initial: ReadonlyMap<string, readonly SetRow[]>,
  saved: LogDraftRows,
  canAddSets: boolean,
): Map<string, SetRow[]> {
  const result = new Map<string, SetRow[]>();
  for (const [name, rows] of initial) {
    const mine = saved[name];
    if (!mine) {
      result.set(name, [...rows]);
      continue;
    }
    const limit = canAddSets ? mine.length : Math.min(mine.length, rows.length);
    const merged = rows.map((row, index) => (index < limit ? mine[index] : row));
    for (let index = rows.length; index < limit; index++) merged.push(mine[index]);
    result.set(name, merged);
  }
  return result;
}
