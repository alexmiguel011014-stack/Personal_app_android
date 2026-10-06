/** A deadline is expired at the exact millisecond it reaches. */
export function isDeadlineExpired(deadline: number, now: number): boolean {
  return deadline <= now;
}
