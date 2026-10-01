// GOALS.md §25i — a soft, per-browser count of today's Gemini generations ("3 hoje"). It is a hint for
// the trainer, not a limit: the real quota is Google's, per project, and unpublished per model (it is
// shown in Google AI Studio). Storage is passed in so this stays testable; a missing or throwing
// storage (private window, blocked site data) just counts as zero.

export interface CounterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyFor = (day: string) => `ficha-gemini-uses-${day}`;

/** "YYYY-MM-DD" of `now` in the browser's local time — the trainer's own day. */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function usesToday(storage: CounterStorage | null, now: Date): number {
  try {
    const value = Number(storage?.getItem(keyFor(localDay(now))) ?? 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/** Counts one more generation today and returns the new total. */
export function recordUse(storage: CounterStorage | null, now: Date): number {
  const next = usesToday(storage, now) + 1;
  try {
    storage?.setItem(keyFor(localDay(now)), String(next));
  } catch {
    // Not saving is fine; the count is a convenience.
  }
  return next;
}
