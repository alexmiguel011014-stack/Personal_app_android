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
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "../../data/authErrors";
import { getFirebase } from "../../data/firebase";
import { claimInvite, normalizeInviteCode } from "../../data/invites";
import { useSession } from "../SessionProvider";
import { SignOutButton } from "../SignOutButton";

// GOALS.md §23f: open the link, create an account (or sign in), and land connected to the trainer.
// The single clearest thing the web front can do that the canvas build couldn't — it had no URLs.

export function InviteClaim() {
  const { session, refresh } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => normalizeInviteCode(searchParams.get("c") ?? ""));
  const [mode, setMode] = useState<"create" | "signIn">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claimAs(uid: string) {
    const result = await claimInvite(getFirebase().db, uid, code, Date.now());
    if (!result.ok) {
      setError(result.message);
      return;
    }
    await refresh(); // the profile just gained a trainerId; /aluno's gate reads it
    router.replace("/aluno");
  }

  async function createAccountAndClaim(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { auth } = getFirebase();
      await setPersistence(auth, stayLoggedIn ? browserLocalPersistence : browserSessionPersistence);
      const credential =
        mode === "create"
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
      await claimAs(credential.user.uid);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function claimSignedIn(uid: string) {
    setBusy(true);
    setError(null);
    try {
      await claimAs(uid);
    } finally {
      setBusy(false);
    }
  }

  const codeField = (
    <p>
      <label>
        Código do convite{" "}
        <input value={code} onChange={(e) => setCode(normalizeInviteCode(e.target.value))} required maxLength={8} />
      </label>
    </p>
  );

  if (busy) return <p>Aceitando o convite…</p>;
  if (session.status === "loading") return <p>Carregando…</p>;

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
    return (
      <>
        <p>Conectado como {session.email}.</p>
        {codeField}
        <button type="button" disabled={code === ""} onClick={() => void claimSignedIn(session.uid)}>
          Aceitar convite
        </button>
        {error && <p role="alert">{error}</p>}
        <p>
          Não é você? <SignOutButton />
        </p>
      </>
    );
  }

  return (
    <>
      <p>Seu personal convidou você. Crie sua conta para ver sua ficha e registrar seus treinos.</p>
      <form onSubmit={createAccountAndClaim}>
        {codeField}
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
        <button type="submit">{mode === "create" ? "Criar conta e aceitar" : "Entrar e aceitar"}</button>
      </form>
      <p>
        <button type="button" onClick={() => setMode(mode === "create" ? "signIn" : "create")}>
          {mode === "create" ? "Já tenho conta" : "Criar uma conta nova"}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
