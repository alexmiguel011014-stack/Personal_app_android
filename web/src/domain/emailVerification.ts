// GOALS.md §27e — the small pure rules behind "Confirme seu e-mail": where the link in the mail brings
// the person back to, and how long the Reenviar button waits. No clock, no window: both are arguments.

/** Firebase's own limit is per IP and per day (GOALS.md §27); this only keeps a nervous double-click
 *  from burning it. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * The page the verification mail's "Continuar" goes back to: the same invite, so the person lands where
 * they left off. Built by hand, so it carries the Pages sub-path and the trailing slash itself
 * (CLAUDE.md: routes end in `/`).
 */
export function verificationContinueUrl(origin: string, basePath: string, code: string): string {
  const base = basePath.replace(/\/+$/, "");
  const query = code === "" ? "" : `?c=${encodeURIComponent(code)}`;
  return `${origin}${base}/convite/${query}`;
}

/** Seconds left before Reenviar may send again; 0 when it may (or nothing was sent yet). */
export function resendWaitSeconds(
  lastSentAt: number | null,
  now: number,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, Math.ceil((lastSentAt + cooldownSeconds * 1000 - now) / 1000));
}
