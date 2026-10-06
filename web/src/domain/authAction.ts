// GOALS.md §32e — the pure rules behind /acao/, the page Firebase's e-mail links open once the console's
// "action URL" points at it. Firebase appends `mode`, `oobCode`, `apiKey`, `continueUrl` and `lang` to that
// address, so everything here is read from a query string anybody can write: nothing in it is trusted,
// least of all `continueUrl` (an open redirect if the page followed it blindly). No Firebase, no window,
// no clock — the page and src/data/authAction.ts do the I/O.

export type ActionMode = "verifyEmail" | "resetPassword" | "recoverEmail" | "verifyAndChangeEmail";

export interface ActionLink {
  mode: ActionMode | null;
  oobCode: string | null;
  continueUrl: string | null;
  lang: string | null;
}

const MODES: readonly ActionMode[] = ["verifyEmail", "resetPassword", "recoverEmail", "verifyAndChangeEmail"];

/** The password rule the rest of the site already uses (`minLength={6}` on sign-up, `auth/weak-password`). */
export const MIN_PASSWORD_LENGTH = 6;

function clean(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Reads the link's parameters; an unknown or missing `mode` is `null`, never a guess. */
export function parseActionLink(search: string | URLSearchParams): ActionLink {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const mode = clean(params.get("mode"));
  return {
    mode: MODES.find((known) => known === mode) ?? null,
    oobCode: clean(params.get("oobCode")),
    continueUrl: clean(params.get("continueUrl")),
    lang: clean(params.get("lang")),
  };
}

/**
 * Where "Continuar" may go: only an address on this site's own origin and under its base path, with the
 * whole query kept (§29's `accountEmailChange=confirmed` has to survive). Anything else — another host, a
 * `javascript:` or `data:` URL, `//evil.example`, a different port, user-info tricks, a `..` out of the base
 * path — is `null`, and the page offers /entrar/ instead.
 */
export function safeContinueUrl(raw: string | null, origin: string, basePath: string): string | null {
  if (raw === null || raw.trim() === "") return null;
  let target: URL;
  let site: URL;
  try {
    site = new URL(origin);
    target = new URL(raw.trim()); // absolute only: a relative or protocol-relative value throws
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return null;
  if (target.username !== "" || target.password !== "") return null;
  if (target.origin !== site.origin) return null;
  const base = basePath.replace(/\/+$/, "");
  // `new URL` has already resolved any `..` / `%2e%2e`, so this checks where the path really lands.
  if (base !== "" && target.pathname !== base && !target.pathname.startsWith(`${base}/`)) return null;
  return target.toString();
}

/** The two things a one-time code can be wrong for (spent or too old), or null for any other error. */
export function isSpentCode(code: string | undefined): boolean {
  return code === "auth/expired-action-code" || code === "auth/invalid-action-code";
}

/** What to tell the person when the link's action failed — and what to do next. */
export function actionErrorMessage(code: string | undefined, mode: ActionMode | null): string {
  if (isSpentCode(code)) {
    switch (mode) {
      case "verifyEmail":
        return "Este link já foi usado ou expirou. Se você já confirmou o e-mail, volte e continue; se não, volte à página do convite e toque em “Reenviar e-mail”.";
      case "verifyAndChangeEmail":
        return "Este link já foi usado ou expirou. Se a troca de e-mail não foi concluída, peça outra em Minha conta.";
      case "resetPassword":
        return "Este link já foi usado ou expirou. Peça outro em Entrar → Esqueci minha senha.";
      default:
        return "Este link já foi usado ou expirou.";
    }
  }
  switch (code) {
    case "auth/user-disabled":
      return "Esta conta foi desativada.";
    case "auth/user-not-found":
      return "Não encontramos a conta deste link. Ela pode ter sido removida.";
    case "auth/weak-password":
      return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    case "auth/network-request-failed":
      return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Espere alguns minutos e tente de novo.";
    default:
      return "Não foi possível concluir. Tente de novo.";
  }
}

/** The new-password form's own checks, before anything is sent; null when it may be submitted. */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  if (password === "") return "Digite a nova senha.";
  if (password.length < MIN_PASSWORD_LENGTH) return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (password !== confirmation) return "A senha e a confirmação estão diferentes.";
  return null;
}
