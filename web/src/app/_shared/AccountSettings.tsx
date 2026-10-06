"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  accountEmailChangeContinueUrl,
  accountSecurityErrorMessage,
  changeAccountPassword,
  clearAccountEmailChangeReturn,
  clearPendingAccountEmailChange,
  isAccountEmailChangeReturn,
  loadPendingAccountEmailChange,
  loadPersonalAccount,
  normalizePersonalPhone,
  requestAccountEmailChange,
  savePendingAccountEmailChange,
  savePersonalPhone,
  syncVerifiedAccountEmail,
} from "../../data/account";
import { getFirebase } from "../../data/firebase";
import { useSession } from "../SessionProvider";
import { AccountAvatarSettings } from "./AccountAvatarSettings";
import { TrainerPlatformBilling } from "./TrainerPlatformBilling";

export function AccountSettings() {
  const { session, refresh } = useSession();
  const uid = session.status === "signedIn" ? session.uid : null;
  const [phone, setPhone] = useState("");
  const [accountEmail, setAccountEmail] = useState(session.status === "signedIn" ? session.email ?? "" : "");
  const [emailVerified, setEmailVerified] = useState(session.status === "signedIn" && session.emailVerified);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailSyncAddress, setEmailSyncAddress] = useState<string | null>(null);
  const [emailSyncError, setEmailSyncError] = useState<string | null>(null);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const syncEmail = useCallback(async (expectedEmail?: string, changeRequested = true) => {
    if (!uid) return;
    const user = getFirebase().auth.currentUser;
    if (!user || user.uid !== uid) {
      setEmailSyncAddress(expectedEmail ?? null);
      setEmailSyncError("Entre novamente para sincronizar o e-mail confirmado.");
      return;
    }
    setEmailSyncing(true);
    setEmailSyncError(null);
    try {
      const verifiedAddress = await syncVerifiedAccountEmail(getFirebase().db, user, expectedEmail);
      setAccountEmail(verifiedAddress);
      setEmailVerified(true);
      setPendingEmail(null);
      setEmailSyncAddress(null);
      // A change the user asked for is "confirmed"; a mirror that was merely behind (an account whose profile
      // never carried the address, e.g. a student who claimed an invite) is just brought up to date.
      setEmailNotice(changeRequested ? "E-mail confirmado e perfil atualizado." : "Perfil atualizado com o e-mail verificado da conta.");
      clearPendingAccountEmailChange(uid);
      await refresh();
    } catch (error) {
      setEmailSyncAddress(expectedEmail ?? user.email ?? null);
      setEmailSyncError(accountSecurityErrorMessage(error));
      setPendingEmail(expectedEmail ?? loadPendingAccountEmailChange(uid));
    } finally {
      clearAccountEmailChangeReturn();
      setEmailSyncing(false);
    }
  }, [uid, refresh]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const pending = loadPendingAccountEmailChange(uid);
    const returnedFromEmailAction = isAccountEmailChangeReturn(window.location.search);
    void Promise.resolve().then(() => {
      if (cancelled) return null;
      if (pending) setPendingEmail(pending);
      setLoading(true);
      setPhoneError(null);
      return loadPersonalAccount(getFirebase().db, uid);
    })
      .then((profile) => {
        if (cancelled || !profile) return;
        setPhone(profile.phone);
        const user = getFirebase().auth.currentUser;
        if (!user || user.uid !== uid) return;
        setAccountEmail(user.email ?? profile.email ?? "");
        setEmailVerified(user.emailVerified);
        const verifiedEmailDiffers = user.emailVerified && !!user.email &&
          profile.email?.toLowerCase() !== user.email.toLowerCase();
        if (returnedFromEmailAction || verifiedEmailDiffers) void syncEmail(pending ?? undefined, returnedFromEmailAction || !!pending);
      })
      .catch(() => { if (!cancelled) setPhoneError("Não foi possível carregar seu telefone. Verifique a conexão e tente novamente."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, syncEmail]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.status !== "signedIn" || busy) return;
    setBusy(true);
    setPhoneError(null);
    setPhoneNotice(null);
    try {
      normalizePersonalPhone(phone);
    } catch {
      setPhoneError("Informe um telefone brasileiro com DDD ou um número internacional válido.");
      setBusy(false);
      return;
    }
    try {
      const savedPhone = await savePersonalPhone(getFirebase().db, session.uid, phone);
      setPhone(savedPhone);
      setPhoneNotice("Telefone salvo.");
    } catch {
      setPhoneError("Não foi possível salvar o telefone. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.status !== "signedIn" || emailSending) return;
    const user = getFirebase().auth.currentUser;
    setEmailSending(true);
    setEmailError(null);
    setEmailNotice(null);
    setEmailSyncError(null);
    setEmailSyncAddress(null);
    try {
      if (!user || user.uid !== session.uid) throw new Error("auth/user-token-expired");
      const continueUrl = accountEmailChangeContinueUrl(
        window.location.origin,
        window.location.pathname,
        process.env.NEXT_PUBLIC_BASE_PATH ?? "",
      );
      const sentTo = await requestAccountEmailChange(user, emailDraft, emailCurrentPassword, continueUrl);
      savePendingAccountEmailChange(session.uid, sentTo);
      setPendingEmail(sentTo);
      setEmailDraft("");
      setEmailNotice(`Enviamos a confirmação para ${sentTo}. O endereço só muda depois que você confirmar o link.`);
    } catch (error) {
      setEmailError(accountSecurityErrorMessage(error));
    } finally {
      setEmailCurrentPassword("");
      setEmailSending(false);
    }
  }

  async function submitPasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.status !== "signedIn" || passwordBusy) return;
    const user = getFirebase().auth.currentUser;
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNotice(null);
    try {
      if (!user || user.uid !== session.uid) throw new Error("auth/user-token-expired");
      await changeAccountPassword(user, currentPassword, newPassword, passwordConfirmation);
      setPasswordNotice("Senha alterada.");
    } catch (error) {
      setPasswordError(accountSecurityErrorMessage(error));
    } finally {
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      setPasswordBusy(false);
    }
  }

  return (
    <>
      {session.status === "signedIn" && <AccountAvatarSettings uid={session.uid} name={accountEmail || "Minha conta"} />}
      {session.status === "signedIn" && session.profile.role === "TRAINER" && <TrainerPlatformBilling uid={session.uid} />}
      <section className="panel" aria-labelledby="account-email-title">
        <h2 id="account-email-title">E-mail de acesso</h2>
        <p>Atual: <strong>{accountEmail || "Ainda sem dados"}</strong> · {emailVerified ? "verificado" : "não verificado"}</p>
        {pendingEmail && <p role="status">Aguardando confirmação para <strong>{pendingEmail}</strong>. O endereço atual continua ativo até a confirmação.</p>}
        {emailNotice && <p role="status">{emailNotice}</p>}
        {emailError && <p role="alert">{emailError}</p>}
        {emailSyncError && <p role="alert">{emailSyncError}{emailSyncAddress && <> Endereço detectado: <strong>{emailSyncAddress}</strong>.</>}</p>}
        {emailSyncError && <button type="button" aria-disabled={emailSyncing} onClick={() => { if (!emailSyncing) void syncEmail(pendingEmail ?? undefined); }}>
          {emailSyncing ? "Sincronizando…" : "Tentar sincronizar e-mail"}
        </button>}
        {pendingEmail && !emailSyncError && <button type="button" aria-disabled={emailSyncing} onClick={() => { if (!emailSyncing) void syncEmail(pendingEmail); }}>
          {emailSyncing ? "Verificando…" : "Já confirmei o e-mail"}
        </button>}
        <form onSubmit={(event) => void sendEmailChange(event)}>
          <p>
            <label>
              Novo e-mail
              <input type="email" autoComplete="email" required value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} readOnly={emailSending} />
            </label>
            <label>
              Senha atual
              <input type="password" autoComplete="current-password" required value={emailCurrentPassword} onChange={(event) => setEmailCurrentPassword(event.target.value)} readOnly={emailSending} />
            </label>
          </p>
          <button type="submit" aria-disabled={emailSending || session.status !== "signedIn"}>
            {emailSending ? "Enviando confirmação…" : "Enviar confirmação de e-mail"}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="account-password-title">
        <h2 id="account-password-title">Senha</h2>
        <p>Confirme sua senha atual para escolher uma nova.</p>
        {passwordError && <p role="alert">{passwordError}</p>}
        {passwordNotice && <p role="status">{passwordNotice}</p>}
        <form onSubmit={(event) => void submitPasswordChange(event)}>
          <p>
            <label>
              Senha atual
              <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} readOnly={passwordBusy} />
            </label>
            <label>
              Nova senha
              <input type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} readOnly={passwordBusy} />
            </label>
            <label>
              Confirme a nova senha
              <input type="password" autoComplete="new-password" required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} readOnly={passwordBusy} />
            </label>
          </p>
          <button type="submit" aria-disabled={passwordBusy || session.status !== "signedIn"}>
            {passwordBusy ? "Alterando…" : "Alterar senha"}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="personal-phone-title">
        <h2 id="personal-phone-title">Telefone pessoal</h2>
        <p>Opcional. Você poderá usar esse contato em recursos futuros.</p>
        {session.status === "signedIn" && <dl>
          <div><dt>Perfil</dt><dd>{session.profile.role === "ADM" ? "Administrador" : session.profile.role === "TRAINER" ? "Personal" : session.profile.role === "STUDENT" ? "Aluno" : "Sem perfil"}</dd></div>
        </dl>}
        {phoneError && <p role="alert" id="account-phone-error">{phoneError}</p>}
        {phoneNotice && <p role="status">{phoneNotice}</p>}
        <form onSubmit={(event) => void save(event)}>
          <p>
            <label>
              Telefone
              <input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                maxLength={40}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                aria-invalid={phoneError ? true : undefined}
                aria-describedby={phoneError ? "account-phone-error" : undefined}
                readOnly={loading || busy}
                disabled={session.status !== "signedIn"}
                placeholder="(11) 99999-9999"
              />
            </label>
          </p>
          <button type="submit" aria-disabled={loading || busy || session.status !== "signedIn"}>
            {loading ? "Carregando…" : busy ? "Salvando…" : "Salvar telefone"}
          </button>
        </form>
      </section>
    </>
  );
}
