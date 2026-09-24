"use client";

import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authErrorMessage } from "../../data/authErrors";
import { getFirebase } from "../../data/firebase";
import { destinationFor } from "../../data/session";
import { useSession } from "../SessionProvider";
import { SignOutButton } from "../SignOutButton";

// GOALS.md §23f: login for trainers and students who already have an account. Students without one
// arrive through their trainer's invite link (/convite) instead.
//
// "Manter conectado" maps onto Firebase's own persistence rather than a stored preference plus a
// sign-out at startup (the Android approach, CLAUDE.md): unchecked, the session lives only as long
// as the tab (browserSessionPersistence), so there is never a Firebase session alive that the UI
// pretends isn't there — the invariant the Android code protects, kept by construction here.

export default function LoginPage() {
  const { session } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const destination = session.status === "signedIn" ? destinationFor(session) : null;
  useEffect(() => {
    if (destination !== null && destination !== "/entrar") router.replace(destination);
  }, [destination, router]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { auth } = getFirebase();
      await setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
      // trim(): a pasted e-mail with a trailing tab or space is rejected as badly formatted
      // (found on the Android emulator, 2026-09-17).
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (email.trim() === "") {
      setError("Digite seu e-mail acima para receber o link de redefinição.");
      return;
    }
    try {
      await sendPasswordResetEmail(getFirebase().auth, email.trim());
      setNotice("Se existir uma conta com esse e-mail, o link de redefinição foi enviado.");
    } catch (err) {
      setError(authErrorMessage(err));
    }
  }

  if (session.status === "signedIn" && session.profile.role === "NONE") {
    return (
      <main>
        <h1>Entrar</h1>
        <p>
          Login feito, mas esta conta ainda não tem um papel atribuído. Peça para um ADM configurar o
          campo &quot;role&quot; desta conta no Firestore.
        </p>
        <SignOutButton />
      </main>
    );
  }

  return (
    <main>
      <h1>Entrar</h1>
      <form onSubmit={signIn}>
        <p>
          <label>
            E-mail{" "}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </p>
        <p>
          <label>
            Senha{" "}
            <input
              type="password"
              autoComplete="current-password"
              required
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
        <button type="submit" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <p>
        <button type="button" onClick={() => void resetPassword()}>
          Esqueci minha senha
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <p>É aluno e ainda não tem conta? Abra o link de convite que seu personal enviou.</p>
    </main>
  );
}
