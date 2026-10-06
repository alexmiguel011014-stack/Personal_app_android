"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  applyEmailAction,
  applyVerification,
  errorCodeOf,
  inspectRecovery,
  previewReset,
  submitNewPassword,
} from "../../data/authAction";
import { getFirebase } from "../../data/firebase";
import {
  actionErrorMessage,
  isSpentCode,
  newPasswordProblem,
  parseActionLink,
  safeContinueUrl,
  type ActionMode,
} from "../../domain/authAction";

// GOALS.md §32e — the branded handler for Firebase's e-mail links. Firebase appends `mode`, `oobCode`,
// `apiKey`, `continueUrl` and `lang` to the console's "action URL"; this page finishes the job with the
// one-time code. The `continueUrl` is read from a query string anyone can write, so "Continuar" only ever
// goes to this site's own pages (safeContinueUrl), never wherever the link says.

type View =
  | { kind: "working" }
  | { kind: "verified" }
  | { kind: "emailChanged" }
  | { kind: "resetForm"; email: string }
  | { kind: "resetDone" }
  | { kind: "recoverConfirm"; email: string | null }
  | { kind: "recovered" }
  | { kind: "failed"; message: string };

/** What each mode does on arrival. Only `verifyEmail` and `verifyAndChangeEmail` spend the code right away. */
async function begin(mode: ActionMode, oobCode: string): Promise<View> {
  const { auth } = getFirebase();
  switch (mode) {
    case "verifyEmail":
      await applyVerification(auth, oobCode);
      return { kind: "verified" };
    case "verifyAndChangeEmail":
      await applyEmailAction(auth, oobCode);
      return { kind: "emailChanged" };
    case "resetPassword":
      return { kind: "resetForm", email: await previewReset(auth, oobCode) };
    case "recoverEmail":
      // Undoing an e-mail change is security-sensitive: show what will happen and wait for a click.
      return { kind: "recoverConfirm", email: await inspectRecovery(auth, oobCode) };
  }
}

const WORKING_TEXT: Record<ActionMode, string> = {
  verifyEmail: "Confirmando seu e-mail…",
  verifyAndChangeEmail: "Confirmando o novo e-mail…",
  resetPassword: "Verificando o link…",
  recoverEmail: "Verificando o link…",
};

export function ActionClient() {
  const searchParams = useSearchParams();
  const { mode, oobCode, continueUrl } = parseActionLink(searchParams);
  const [view, setView] = useState<View>({ kind: "working" });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // A one-time code: React's dev double-invoke of effects must not spend it twice.
  const started = useRef(false);

  useEffect(() => {
    if (mode === null || oobCode === null || started.current) return;
    started.current = true;
    begin(mode, oobCode).then(setView, (error: unknown) =>
      setView({ kind: "failed", message: actionErrorMessage(errorCodeOf(error), mode) }),
    );
  }, [mode, oobCode]);

  // Each new state is a new "page" for a screen reader: move focus to its heading.
  const kind = mode === null || oobCode === null ? "invalid" : view.kind;
  useEffect(() => heading.current?.focus(), [kind]);

  const toSite = (label: string): ReactNode => {
    // Only reached after the browser rendered (a view other than "working" exists only after the effect).
    const next = safeContinueUrl(continueUrl, window.location.origin, process.env.NEXT_PUBLIC_BASE_PATH ?? "");
    return next ? (
      <a className="button button-primary button-block" href={next}>
        {label}
      </a>
    ) : (
      <Link className="button button-primary button-block" href="/entrar/">
        Ir para Entrar
      </Link>
    );
  };

  const toSignIn = (
    <Link className="button button-primary button-block" href="/entrar/">
      Entrar
    </Link>
  );

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    if (mode !== "resetPassword" || oobCode === null) return;
    const problem = newPasswordProblem(password, confirmation);
    if (problem) {
      setFormError(problem);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await submitNewPassword(getFirebase().auth, oobCode, password);
      setPassword("");
      setConfirmation("");
      setView({ kind: "resetDone" });
    } catch (error) {
      const code = errorCodeOf(error);
      // A spent code cannot be retried; anything else (weak password, network) can.
      if (isSpentCode(code)) setView({ kind: "failed", message: actionErrorMessage(code, mode) });
      else setFormError(actionErrorMessage(code, mode));
    } finally {
      setBusy(false);
    }
  }

  async function recoverEmail() {
    if (mode !== "recoverEmail" || oobCode === null) return;
    setBusy(true);
    try {
      await applyEmailAction(getFirebase().auth, oobCode);
      setView({ kind: "recovered" });
    } catch (error) {
      setView({ kind: "failed", message: actionErrorMessage(errorCodeOf(error), mode) });
    } finally {
      setBusy(false);
    }
  }

  function panel(title: string, body: ReactNode) {
    return (
      <>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {body}
      </>
    );
  }

  if (mode === null || oobCode === null) {
    return panel(
      "Link inválido",
      <>
        <p>Este endereço não é um link de e-mail completo. Abra o link direto do e-mail que você recebeu.</p>
        <Link className="button button-primary button-block" href="/entrar/">
          Ir para Entrar
        </Link>
      </>,
    );
  }

  switch (view.kind) {
    case "working":
      return panel("Um instante…", <p className="loading">{WORKING_TEXT[mode]}</p>);
    case "verified":
      return panel(
        "E-mail confirmado",
        <>
          <p>Pronto: confirmamos que o endereço é seu.</p>
          {toSite("Continuar")}
        </>,
      );
    case "emailChanged":
      return panel(
        "Novo e-mail confirmado",
        <>
          <p>A troca de e-mail foi concluída. Se o site pedir, entre de novo com o novo endereço.</p>
          {toSite("Continuar")}
        </>,
      );
    case "resetForm":
      return panel(
        "Crie ou redefina sua senha",
        <form onSubmit={(event) => void savePassword(event)}>
          <p className="lede">
            Nova senha para <strong>{view.email}</strong>.
          </p>
          <p>
            <label>
              Nova senha{" "}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </p>
          <p>
            <label>
              Repita a senha{" "}
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
          </p>
          {formError && <p role="alert">{formError}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Salvando…" : "Salvar senha"}
          </button>
        </form>,
      );
    case "resetDone":
      return panel(
        "Senha atualizada",
        <>
          <p>Use a nova senha para entrar.</p>
          {toSignIn}
        </>,
      );
    case "recoverConfirm":
      return panel(
        "Desfazer a troca de e-mail?",
        <>
          <p>
            {view.email ? (
              <>
                O e-mail da conta voltará a ser <strong>{view.email}</strong>.
              </>
            ) : (
              "O e-mail da conta voltará ao endereço anterior."
            )}
          </p>
          <button type="button" className="button-primary button-block" disabled={busy} onClick={() => void recoverEmail()}>
            {busy ? "Restaurando…" : "Restaurar e-mail"}
          </button>
        </>,
      );
    case "recovered":
      return panel(
        "E-mail restaurado",
        <>
          <p>Por segurança, redefina também a sua senha em Entrar → Esqueci minha senha.</p>
          {toSignIn}
        </>,
      );
    case "failed":
      return panel(
        "Não foi possível concluir",
        <>
          <p role="alert">{view.message}</p>
          <Link className="button button-primary button-block" href="/entrar/">
            Ir para Entrar
          </Link>
        </>,
      );
  }
}
