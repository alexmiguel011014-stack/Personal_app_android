import { doc, getDoc, serverTimestamp, updateDoc, type Firestore } from "firebase/firestore";
import {
  EmailAuthProvider,
  getIdToken,
  reauthenticateWithCredential,
  reload,
  updatePassword,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";

import { normalizeAccountName } from "../domain/accountName";

const MAX_PHONE_LENGTH = 40;

function isBrazilianNationalNumber(digits: string): boolean {
  return /^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(digits);
}

export function normalizePersonalPhone(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (input.length > MAX_PHONE_LENGTH) throw new Error("O telefone deve ter no máximo 40 caracteres.");
  const compact = input.replace(/[\s().-]/g, "");
  const digits = compact.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) throw new Error("Informe um telefone válido, com DDD e código do país quando necessário.");
  if (digits.startsWith("55") && isBrazilianNationalNumber(digits.slice(2))) return `+${digits}`;
  if (!compact.startsWith("+") && isBrazilianNationalNumber(digits)) return `+55${digits}`;
  if (!digits.startsWith("55") && /^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  throw new Error("Informe um telefone válido, com DDD e código do país quando necessário.");
}

export function formatPersonalPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const br = digits.match(/^55([1-9]\d)([2-5]\d{7}|9\d{8})$/);
  return br ? `+55 (${br[1]}) ${br[2].slice(0, -4)}-${br[2].slice(-4)}` : value;
}

export async function loadPersonalPhone(db: Firestore, uid: string): Promise<string> {
  return (await loadPersonalAccount(db, uid)).phone;
}

export interface PersonalAccountMirror {
  phone: string;
  email: string | null;
  /** The display name on the profile (what the trainer and the ADM see). */
  name: string;
  /** When the user last changed their own name on the account page (server time); null when never. */
  nameChangedAt: number | null;
}

/** `nameChangedAt` is a Firestore timestamp (written with the server's clock); an integer is read leniently. */
function millisOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value !== null && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function loadPersonalAccount(db: Firestore, uid: string): Promise<PersonalAccountMirror> {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) throw new Error("Não foi possível localizar seu perfil.");
  const phone = snapshot.get("phone");
  const email = snapshot.get("email");
  const name = snapshot.get("name");
  return {
    phone: typeof phone === "string" ? formatPersonalPhone(phone) : "",
    email: typeof email === "string" ? email : null,
    name: typeof name === "string" ? name : "",
    nameChangedAt: millisOrNull(snapshot.get("nameChangedAt")),
  };
}

/**
 * Self-service rename: at most once every 60 days. The change is stamped with `serverTimestamp()` and firestore.rules (v5)
 * accept it only when that stamp is the request's own time and the previous stamp is missing or at least 60 days old, so the
 * wait cannot be shortened with a wrong device clock. Resolves with the stored name and the server's stamp.
 */
export async function savePersonalName(db: Firestore, uid: string, input: string): Promise<{ name: string; nameChangedAt: number | null }> {
  const name = normalizeAccountName(input);
  const ref = doc(db, "users", uid);
  await updateDoc(ref, { name, nameChangedAt: serverTimestamp() });
  const saved = await getDoc(ref);
  return { name, nameChangedAt: millisOrNull(saved.get("nameChangedAt")) };
}

/** Self-update of the existing optional phone field; Firestore rules remain the authorization boundary. */
export async function savePersonalPhone(db: Firestore, uid: string, value: string): Promise<string> {
  const phone = normalizePersonalPhone(value);
  await updateDoc(doc(db, "users", uid), { phone });
  return formatPersonalPhone(phone);
}

function accountError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code: `account/${code}` });
}

async function reauthenticateWithPassword(user: User, currentPassword: string): Promise<void> {
  if (!user.email) throw accountError("email-auth-required");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
}

export async function requestAccountEmailChange(
  user: User,
  newEmail: string,
  currentPassword: string,
  continueUrl: string,
): Promise<string> {
  const targetEmail = newEmail.trim();
  if (!targetEmail) throw accountError("email-required");
  if (!user.email) throw accountError("email-auth-required");
  if (targetEmail.toLowerCase() === user.email.toLowerCase()) throw accountError("email-unchanged");

  await reauthenticateWithPassword(user, currentPassword);
  await verifyBeforeUpdateEmail(user, targetEmail, { url: continueUrl });
  return targetEmail;
}

export async function changeAccountPassword(
  user: User,
  currentPassword: string,
  newPassword: string,
  confirmation: string,
): Promise<void> {
  if (newPassword !== confirmation) throw accountError("password-confirmation");
  if (!user.email) throw accountError("email-auth-required");

  await reauthenticateWithPassword(user, currentPassword);
  await updatePassword(user, newPassword);
}

/** Called after the Firebase action returns; the verified Auth address is authoritative. */
export async function syncVerifiedAccountEmail(db: Firestore, user: User, expectedEmail?: string): Promise<string> {
  await reload(user);
  await getIdToken(user, true);
  if (!user.emailVerified || !user.email) throw accountError("email-not-verified");
  const verifiedEmail = user.email.trim();
  if (expectedEmail && verifiedEmail.toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    throw accountError("email-change-pending");
  }
  await updateDoc(doc(db, "users", user.uid), { email: verifiedEmail });
  return verifiedEmail;
}

export function accountEmailChangeContinueUrl(origin: string, pathname: string, basePath: string): string {
  const originUrl = new URL(origin);
  const base = `/${basePath.split("/").filter(Boolean).join("/")}`.replace(/\/$/, "");
  const routePath = base && (pathname === base || pathname.startsWith(`${base}/`))
    ? pathname.slice(base.length) || "/"
    : pathname;
  const path = `${base}${routePath.startsWith("/") ? routePath : `/${routePath}`}` || "/";
  const continueUrl = new URL(path, originUrl.origin);
  if (continueUrl.origin !== originUrl.origin) throw accountError("invalid-continue-url");
  continueUrl.searchParams.set("accountEmailChange", "confirmed");
  return continueUrl.toString();
}

export function isAccountEmailChangeReturn(search: string): boolean {
  return new URLSearchParams(search).get("accountEmailChange") === "confirmed";
}

export function clearAccountEmailChangeReturn(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("accountEmailChange");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const PENDING_EMAIL_CHANGE_PREFIX = "allu.account.pending-email-change.";

export function savePendingAccountEmailChange(uid: string, email: string): void {
  try {
    window.localStorage.setItem(`${PENDING_EMAIL_CHANGE_PREFIX}${uid}`, email);
  } catch {
    // The UI still keeps the pending address in memory if browser storage is unavailable.
  }
}

export function loadPendingAccountEmailChange(uid: string): string | null {
  try {
    return window.localStorage.getItem(`${PENDING_EMAIL_CHANGE_PREFIX}${uid}`);
  } catch {
    return null;
  }
}

export function clearPendingAccountEmailChange(uid: string): void {
  try {
    window.localStorage.removeItem(`${PENDING_EMAIL_CHANGE_PREFIX}${uid}`);
  } catch {
    // Sync success is still final when browser storage is unavailable.
  }
}

export function accountSecurityErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  switch (code) {
    case "account/email-required": return "Informe o novo e-mail.";
    case "account/email-auth-required": return "Esta conta não tem um e-mail de acesso compatível com senha.";
    case "account/email-unchanged": return "Esse já é o e-mail atual da conta.";
    case "account/password-confirmation": return "A nova senha e a confirmação estão diferentes.";
    case "account/email-not-verified": return "A confirmação ainda não foi concluída. Abra o link enviado ao novo endereço e tente novamente.";
    case "account/email-change-pending": return "O Auth ainda não mostra o novo endereço. Confirme o link antes de sincronizar o perfil.";
    case "account/invalid-continue-url": return "Não foi possível montar o endereço seguro de retorno.";
    case "auth/invalid-credential":
    case "auth/wrong-password": return "A senha atual não confere.";
    case "auth/requires-recent-login": return "Por segurança, entre novamente e tente a alteração mais uma vez.";
    case "auth/email-already-in-use": return "Esse e-mail já está associado a outra conta.";
    case "auth/invalid-email": return "Informe um endereço de e-mail válido.";
    case "auth/weak-password": return "A nova senha não atende aos requisitos do Firebase.";
    case "auth/too-many-requests": return "Muitas tentativas. Aguarde um pouco e tente novamente.";
    case "auth/network-request-failed": return "Sem conexão com o Firebase. Verifique a internet e tente novamente.";
    case "auth/user-token-expired": return "Sua sessão expirou. Entre novamente e repita a alteração.";
    case "permission-denied": return "O e-mail foi confirmado no Auth, mas o perfil não foi atualizado. Tente sincronizar novamente.";
    default: return "Não foi possível concluir a alteração. Verifique os dados e tente novamente.";
  }
}
