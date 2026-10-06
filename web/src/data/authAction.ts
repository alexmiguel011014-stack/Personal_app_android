import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
  type Auth,
} from "firebase/auth";
import { confirmVerified } from "./emailVerification";

// GOALS.md §32e — what /acao/ does with the one-time code in a Firebase e-mail link. Thin on purpose: the
// rules live in domain/authAction.ts, and each function here is one Firebase call with the order that
// matters. Takes the `Auth` instance as a parameter like the rest of src/data/, so the tests hand in a fake.

/** Firebase error code (`auth/expired-action-code`, …) of whatever was thrown, if it carries one. */
export function errorCodeOf(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

/** The address a `recoverEmail` link would restore, read without spending the code. */
export async function inspectRecovery(auth: Auth, oobCode: string): Promise<string | null> {
  const info = await checkActionCode(auth, oobCode);
  return info.data.email ?? null;
}

/**
 * `verifyEmail`: confirms the address. If the same account is signed in in this browser, its session is then
 * brought up to date too — `confirmVerified` reloads the user AND forces a new ID token, the part
 * firestore.rules read (§27) — so the invite page the link returns to is already verified. That refresh is a
 * courtesy: the address IS confirmed by now, and the invite page re-checks on its own, so a failure here is
 * swallowed rather than shown as if the link had failed.
 */
export async function applyVerification(auth: Auth, oobCode: string): Promise<void> {
  await applyActionCode(auth, oobCode);
  const user = auth.currentUser;
  if (!user) return;
  try {
    await confirmVerified(user);
  } catch {
    // The invite page's "Já confirmei" / focus re-check does the same refresh.
  }
}

/** `verifyAndChangeEmail` and `recoverEmail`: apply the code, nothing else (§29's page syncs its own profile). */
export function applyEmailAction(auth: Auth, oobCode: string): Promise<void> {
  return applyActionCode(auth, oobCode);
}

/** `resetPassword`, step 1: checks the code and returns the address the new password is for. */
export function previewReset(auth: Auth, oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

/** `resetPassword`, step 2: spends the code. Never signs the person in. */
export function submitNewPassword(auth: Auth, oobCode: string, newPassword: string): Promise<void> {
  return confirmPasswordReset(auth, oobCode, newPassword);
}
