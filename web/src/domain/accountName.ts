// A user may correct their own name once every 60 days (the account page, GOALS.md §29g). Pure rules only — the data
// layer stamps the change with the server's clock and firestore.rules (v5) enforce the same interval, so a client clock
// can neither shorten the wait nor skip it.

export const NAME_CHANGE_INTERVAL_DAYS = 60;
const DAY_MS = 86_400_000;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 80;

/** Trims and collapses inner whitespace; throws a user-facing message when the result is not an acceptable name. */
export function normalizeAccountName(input: string): string {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length < MIN_NAME_LENGTH) throw new Error(`O nome precisa ter pelo menos ${MIN_NAME_LENGTH} caracteres.`);
  if (name.length > MAX_NAME_LENGTH) throw new Error(`O nome pode ter no máximo ${MAX_NAME_LENGTH} caracteres.`);
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("O nome não pode ter caracteres de controle.");
  return name;
}

/** The first instant at which the name may be changed again; null when it has never been changed through the account page. */
export function nextNameChangeAt(lastChangedAt: number | null): number | null {
  return lastChangedAt === null ? null : lastChangedAt + NAME_CHANGE_INTERVAL_DAYS * DAY_MS;
}

export function canChangeName(lastChangedAt: number | null, now: number): boolean {
  const next = nextNameChangeAt(lastChangedAt);
  return next === null || now >= next;
}

/**
 * Whole days left until the name may change again (0 when it may change now). `now` is the device's clock while the stamp is
 * the server's, so a device a few seconds behind must not read "61 days" right after a change: time never counts from before
 * the stamp.
 */
export function daysUntilNameChange(lastChangedAt: number | null, now: number): number {
  const next = nextNameChangeAt(lastChangedAt);
  if (next === null || now >= next) return 0;
  return Math.ceil((next - Math.max(now, lastChangedAt ?? now)) / DAY_MS);
}
