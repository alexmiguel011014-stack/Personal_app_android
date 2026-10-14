// GOALS.md §38e (D8): the rest timer between sets. The timer is an END instant, not a counter: the remaining time is
// always computed from the clock, so a throttled or backgrounded tab (a locked phone at the gym) shows the right
// number the moment it wakes, and a late tick cannot drift it.

/** Used when the trainer did not prescribe a rest for the exercise. */
export const DEFAULT_REST_SECONDS = 90;
/** What "−15 s" and "+15 s" move the end by. */
export const REST_STEP_SECONDS = 15;
/** The timer never runs longer than this (the trainer's own limit for a prescribed rest is 600). */
export const MAX_TIMER_SECONDS = 1800;

/** The seconds a "Descansar" button starts: the prescribed rest, else the default. */
export function restDuration(prescribed: number | null): number {
  return prescribed !== null && prescribed > 0
    ? Math.min(prescribed, MAX_TIMER_SECONDS)
    : DEFAULT_REST_SECONDS;
}

/** Whole seconds left, rounded up (so "0:01" shows until the very end), never below zero. */
export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function isRestOver(endsAt: number, now: number): boolean {
  return now >= endsAt;
}

/** Moves the end by `deltaSeconds`; it cannot go before `now` (which ends the rest) or past MAX_TIMER_SECONDS from `now`. */
export function adjustRest(
  endsAt: number,
  deltaSeconds: number,
  now: number,
): number {
  return Math.min(
    Math.max(endsAt + deltaSeconds * 1000, now),
    now + MAX_TIMER_SECONDS * 1000,
  );
}

/** 65 → "1:05"; 9 → "0:09". */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const rest = whole % 60;
  return `${Math.floor(whole / 60)}:${rest < 10 ? "0" : ""}${rest}`;
}
