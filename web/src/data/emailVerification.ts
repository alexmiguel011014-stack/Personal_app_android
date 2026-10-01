import { deleteUser, sendEmailVerification, type User } from "firebase/auth";

// GOALS.md §27e — the verified e-mail a new student needs before claiming an invite. firestore.rules
// (hasVerifiedEmail, §27c) read it from the ID TOKEN, and the token does not change when the person
// clicks the link in the mail — often on another device. So before any gated write the page must
// reload the user AND force a new token; skipping the second step leaves the rules seeing `false` and
// refuses a student who did everything right.

/** The parts of a Firebase User this file needs — narrow, so the tests can hand in a fake. */
export interface VerifiableUser {
  readonly emailVerified: boolean;
  reload(): Promise<void>;
  getIdToken(forceRefresh?: boolean): Promise<string>;
}

/** True once the address is confirmed AND the token the rules will read says so. */
export async function confirmVerified(user: VerifiableUser): Promise<boolean> {
  await user.reload();
  if (!user.emailVerified) return false;
  await user.getIdToken(true);
  return true;
}

/** The link in the mail; its "Continuar" goes back to `continueUrl` (an authorized domain). */
export function sendVerification(user: User, continueUrl: string): Promise<void> {
  return sendEmailVerification(user, { url: continueUrl });
}

/**
 * "Usei o e-mail errado": delete the account just created with a mistyped address, so the person can
 * start over with the right one. Never a verified account — that one belongs to somebody for real.
 */
export async function discardUnverifiedAccount(user: User): Promise<void> {
  await user.reload();
  if (user.emailVerified) throw new Error("This account's e-mail is verified; it is not discarded from here.");
  await deleteUser(user);
}
