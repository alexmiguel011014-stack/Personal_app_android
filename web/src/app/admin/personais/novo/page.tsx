"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authErrorMessage } from "../../../../data/authErrors";
import { completeTrainerProfile, createInitialPassword, createTrainerAuthUser, sendTrainerPasswordReset } from "../../../../data/adminCreate";
import { getFirebase } from "../../../../data/firebase";
import { emailSuggestionToConfirm } from "../../../../domain/adminEmailSuggestion";
import { validateEmail } from "../../../../domain/emailPolicy";
import { useSession } from "../../../SessionProvider";

interface PendingTrainer {
  uid: string;
  name: string;
  email: string;
  phone: string;
}

export default function NewTrainerPage() {
  const { session } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<PendingTrainer | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ typed: string; corrected: string } | null>(null);
  const [acceptedTypedEmail, setAcceptedTypedEmail] = useState<string | null>(null);

  if (session.status !== "signedIn") return null;
  const adminUid = session.uid;

  async function saveProfile(trainer: PendingTrainer) {
    setBusy(true);
    setError(null);
    try {
      await completeTrainerProfile(getFirebase().db, adminUid, trainer.uid, trainer);
      setProfileSaved(true);
      setNotice(`Cadastro salvo para ${trainer.email}.`);
      await sendReset(trainer.email);
    } catch (err) {
      if (!profileSaved) {
        setError(`Não foi possível salvar o perfil. A conta de acesso já existe (UID: ${trainer.uid}). Tente concluir esta etapa novamente.`);
      } else {
        setError(authErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(address: string) {
    try {
      await sendTrainerPasswordReset(getFirebase().auth, address);
      setNotice(`Cadastro concluído. Enviamos a ${address} um link para definir a senha.`);
      setError(null);
    } catch (err) {
      setNotice(`Cadastro concluído para ${address}, mas o link de senha não foi enviado.`);
      setError(`${authErrorMessage(err)} Você pode tentar enviar o link novamente.`);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSuggestion(null);
    if (name.trim() === "") {
      setError("Digite o nome do personal.");
      return;
    }
    const check = validateEmail(email);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    const suggestionToConfirm = emailSuggestionToConfirm(check.email, check.suggestion, acceptedTypedEmail);
    if (suggestionToConfirm) {
      setSuggestion({ typed: check.email, corrected: suggestionToConfirm });
      return;
    }

    setBusy(true);
    try {
      // The initial password exists only in this call and is never stored or exposed.
      const uid = await createTrainerAuthUser(check.email, createInitialPassword());
      const trainer = { uid, name: name.trim(), email: check.email, phone: phone.trim() };
      setPending(trainer);
      await saveProfile(trainer);
    } catch (err) {
      const message = authErrorMessage(err);
      setError(message.includes("Já existe")
        ? "Já existe uma conta com esse e-mail. Use outro endereço ou promova a conta pelo UID em Solicitações."
        : message);
    } finally {
      setBusy(false);
    }
  }

  async function retryProfile() {
    if (pending && !profileSaved) await saveProfile(pending);
  }

  async function resendReset() {
    if (!pending || !profileSaved || busy) return;
    setBusy(true);
    setError(null);
    await sendReset(pending.email);
    setBusy(false);
  }

  return (
    <main>
      <p className="eyebrow">Personais</p>
      <h1>Cadastrar personal</h1>
      <p className="header-subtitle">Crie o acesso. O personal receberá um link por e-mail para definir a própria senha.</p>

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      {!pending ? (
        <form onSubmit={submit}>
          <p><label>Nome<input autoComplete="name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} required /></label></p>
          <p><label>E-mail<input autoComplete="email" type="email" maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setAcceptedTypedEmail(null); setSuggestion(null); }} required /></label></p>
          {suggestion && (
            <div className="email-suggestion" role="group" aria-label="Sugestão de e-mail">
              <p>Este endereço está próximo de <strong>{suggestion.corrected}</strong>. Quer usar essa sugestão?</p>
              <p>
                <button type="button" onClick={() => { setEmail(suggestion.corrected); setAcceptedTypedEmail(null); setSuggestion(null); }}>Usar sugestão</button>
                <button type="button" onClick={() => { setAcceptedTypedEmail(suggestion.typed); setSuggestion(null); }}>Manter como digitei</button>
              </p>
            </div>
          )}
          <p><label>Telefone <span className="quiet-count">opcional</span><input autoComplete="tel" type="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} /></label></p>
          <p><button type="submit" disabled={busy}>{busy ? "Criando acesso…" : "Criar personal"}</button></p>
        </form>
      ) : (
        <section aria-labelledby="created-heading">
          <h2 id="created-heading">{profileSaved ? "Acesso criado" : "Concluir cadastro"}</h2>
          <p><strong>{pending.name}</strong> · {pending.email}</p>
          {!profileSaved && <p>UID da conta: <code>{pending.uid}</code></p>}
          {!profileSaved ? (
            <button type="button" disabled={busy} onClick={retryProfile}>{busy ? "Salvando…" : "Concluir cadastro"}</button>
          ) : (
            <button type="button" disabled={busy} onClick={resendReset}>{busy ? "Enviando…" : "Reenviar link para definir senha"}</button>
          )}
        </section>
      )}

      <p className="page-actions"><Link href="/admin/personais">Voltar para personais</Link></p>
    </main>
  );
}
