"use client";

import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authErrorMessage } from "../../data/authErrors";
import { confirmVerified, discardUnverifiedAccount, sendVerification } from "../../data/emailVerification";
import { getFirebase } from "../../data/firebase";
import { claimInvite, normalizeInviteCode } from "../../data/invites";
import { validateEmail } from "../../domain/emailPolicy";
import { verificationContinueUrl } from "../../domain/emailVerification";
import { useSession } from "../SessionProvider";
import { SignOutButton } from "../SignOutButton";
import { VerifyEmailPanel } from "./VerifyEmailPanel";

// GOALS.md §23f: open the link, create an account (or sign in), and land connected to the trainer.
// The single clearest thing the web front can do that the canvas build couldn't — it had no URLs.
//
// GOALS.md §27: a new account confirms its e-mail before it claims. firestore.rules refuse the claim
// of an unverified address, so an invented or mistyped one can never become a student; this page is
// the friendly side of that rule — it sends the link, waits, and claims as soon as it sees it opened.

const NOT_CONFIRMED_YET = "Ainda não vimos a confirmação. Abra o link do e-mail e toque em “Já confirmei” de novo.";

export function InviteClaim() {
  const { session, refresh } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeInLink = (searchParams.get("c") ?? "").trim() !== "";
  const [code, setCode] = useState(() => normalizeInviteCode(searchParams.get("c") ?? ""));
  const [mode, setMode] = useState<"create" | "signIn">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ typed: string; suggested: string } | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  // The focus re-check and the buttons can overlap; one check at a time.
  const checking = useRef(false);

  /**
   * Claims the invite once the address is confirmed. confirmVerified reloads the user AND forces a new
   * token — the rules read the token, and opening the link elsewhere does not change the one held here.
   * `quiet` is the automatic re-check: it says nothing when there is nothing new.
   */
  const claimIfVerified = useCallback(
    async (quiet: boolean) => {
      const { auth, db } = getFirebase();
      const user = auth.currentUser;
      if (!user || checking.current) return;
      checking.current = true;
      if (!quiet) {
        setBusy("Conferindo a confirmação…");
        setError(null);
      }
      try {
        if (!(await confirmVerified(user))) {
          if (!quiet) setError(NOT_CONFIRMED_YET);
          return;
        }
        setNotice(null);
        setError(null);
        if (code === "") {
          await refresh(); // confirmed, but no code yet: the page now asks for it
          return;
        }
        setBusy("Aceitando o convite…");
        const result = await claimInvite(db, user.uid, code, Date.now());
        await refresh(); // the profile just gained a trainerId (or, if refused, shows the address confirmed)
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.replace("/aluno");
      } catch (err) {
        if (!quiet) setError(authErrorMessage(err));
      } finally {
        checking.current = false;
        setBusy(null);
      }
    },
    [code, refresh, router],
  );

  async function sendLink() {
    const user = getFirebase().auth.currentUser;
    if (!user) return;
    setError(null);
    try {
      await sendVerification(
        user,
        verificationContinueUrl(window.location.origin, process.env.NEXT_PUBLIC_BASE_PATH ?? "", code),
      );
      setLastSentAt(Date.now());
      setNotice(`Link enviado para ${user.email ?? "o seu e-mail"}.`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  async function enter(address: string) {
    setSuggestion(null);
    setError(null);
    setBusy(mode === "create" ? "Criando sua conta…" : "Entrando…");
    try {
      const { auth } = getFirebase();
      await setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
      if (mode === "create") {
        await createUserWithEmailAndPassword(auth, address, password);
        // A new address is never confirmed yet: send the link, and the panel takes it from here.
        await sendLink();
        await refresh();
        return;
      }
      const { user } = await signInWithEmailAndPassword(auth, address, password);
      // Unconfirmed: the panel shows (no mail goes out unasked — one may already be in the inbox).
      if (user.emailVerified) {
        setBusy(null);
        await claimIfVerified(false);
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "signIn") {
      // Existing accounts sign in with whatever address they have; the checks are for new ones.
      await enter(email.trim());
      return;
    }
    const check = validateEmail(email);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (check.suggestion) {
      setError(null);
      setSuggestion({ typed: check.email, suggested: check.suggestion });
      return;
    }
    await enter(check.email);
  }

  async function wrongEmail() {
    const user = getFirebase().auth.currentUser;
    if (!user) return;
    setBusy("Apagando a conta…");
    setError(null);
    try {
      await discardUnverifiedAccount(user); // signs out: the form comes back with the address as typed
      setNotice(null);
      setLastSentAt(null);
      setMode("create");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const waitingForConfirmation =
    session.status === "signedIn" &&
    !session.emailVerified &&
    session.profile.role === "STUDENT" &&
    session.profile.trainerId === null;

  // The link is usually opened elsewhere (the phone's mail app); coming back to this tab re-checks.
  useEffect(() => {
    if (!waitingForConfirmation) return;
    const recheck = () => {
      if (document.visibilityState === "visible") void claimIfVerified(true);
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [waitingForConfirmation, claimIfVerified]);

  const codeField = (
    <p>
      <label>
        Código do convite{" "}
        <input value={code} onChange={(e) => setCode(normalizeInviteCode(e.target.value))} required maxLength={8} />
      </label>
    </p>
  );

  if (busy) return <p className="loading">{busy}</p>;
  if (session.status === "loading") return <p className="loading">Carregando…</p>;

  if (session.status === "signedIn") {
    const { role, trainerId } = session.profile;
    if (role === "TRAINER" || role === "ADM") {
      return (
        <>
          <p>Esta conta é de treinador. Convites são para alunos.</p>
          <p>
            <Link href="/app">Ir para o painel</Link>
          </p>
        </>
      );
    }
    if (role === "STUDENT" && trainerId !== null) {
      return (
        <>
          <p>Você já está conectado ao seu personal.</p>
          <p>
            <Link href="/aluno">Ir para minha ficha</Link>
          </p>
        </>
      );
    }
    if (!session.emailVerified) {
      return (
        <>
          <VerifyEmailPanel
            email={session.email}
            lastSentAt={lastSentAt}
            notice={notice}
            error={error}
            onSend={() => void sendLink()}
            onConfirmed={() => void claimIfVerified(false)}
            onWrongEmail={() => void wrongEmail()}
          />
          {!codeInLink && codeField}
        </>
      );
    }
    return (
      <>
        <p>Conectado como {session.email}.</p>
        {codeField}
        <button type="button" disabled={code === ""} onClick={() => void claimIfVerified(false)}>
          Aceitar convite
        </button>
        {error && <p role="alert">{error}</p>}
        <p>
          Não é você? <SignOutButton className="link-button" />
        </p>
      </>
    );
  }

  return (
    <>
      <p>Seu personal convidou você. Crie sua conta para ver sua ficha e registrar seus treinos.</p>
      <form onSubmit={(event) => void submit(event)}>
        {codeField}
        <p>
          <label>
            E-mail{" "}
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setSuggestion(null);
              }}
            />
          </label>
        </p>
        {suggestion && (
          <div role="alert" className="email-suggestion">
            <p>
              Você quis dizer <strong>{suggestion.suggested}</strong>?
            </p>
            <p>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  setEmail(suggestion.suggested);
                  void enter(suggestion.suggested);
                }}
              >
                Usar esse
              </button>
              <button type="button" onClick={() => void enter(suggestion.typed)}>
                Manter o que digitei
              </button>
            </p>
          </div>
        )}
        <p>
          <label>
            Senha{" "}
            <input
              type="password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            <input type="checkbox" checked={stayLoggedIn} onChange={(e) => setStayLoggedIn(e.target.checked)} /> Manter
            conectado
          </label>
        </p>
        {mode === "create" && (
          <p className="subtle">Use um e-mail que você abre: vamos mandar um link para confirmar que ele é seu.</p>
        )}
        <button type="submit">{mode === "create" ? "Criar conta e aceitar" : "Entrar e aceitar"}</button>
      </form>
      <p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === "create" ? "signIn" : "create");
            setSuggestion(null);
          }}
        >
          {mode === "create" ? "Já tenho conta" : "Criar uma conta nova"}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
