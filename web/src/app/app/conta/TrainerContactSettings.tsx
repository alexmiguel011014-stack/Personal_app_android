"use client";

import { useEffect, useState, type FormEvent } from "react";
import { loadPersonalAccount } from "../../../data/account";
import { getFirebase } from "../../../data/firebase";
import { loadTrainerContact, removeMyContact, saveMyContact } from "../../../data/trainerContacts";
import { CONTACT_NAME_MAX, checkContactInput } from "../../../domain/trainerContact";
import { useSession } from "../../SessionProvider";

// GOALS.md §38h (D9): "Mostrar meu WhatsApp para os meus alunos" — an opt-in card (name + number) the linked alunos see
// on their home as "Falar com <nome>". Off by default; turning it off deletes the document. Pre-filled from the account.

type Phase = { status: "loading" } | { status: "error" } | { status: "ready"; on: boolean };

export function TrainerContactSettings() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Settings uid={session.uid} />;
}

function Settings({ uid }: { uid: string }) {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { db } = getFirebase();
    Promise.all([loadTrainerContact(db, uid), loadPersonalAccount(db, uid)]).then(
      ([contact, account]) => {
        if (cancelled) return;
        setName(contact?.name ?? account.name);
        setWhatsapp(contact?.whatsapp ?? account.phone);
        setPhase({ status: "ready", on: contact !== null });
      },
      () => !cancelled && setPhase({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const checked = checkContactInput({ name, whatsapp });
    if (!checked.ok) {
      setError(checked.problem === "name" ? `Informe o nome que seus alunos verão (2 a ${CONTACT_NAME_MAX} letras).` : "Informe um WhatsApp brasileiro com DDD, por exemplo (11) 99999-0000.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveMyContact(getFirebase().db, uid, checked);
      setPhase({ status: "ready", on: true });
      setNotice("Seus alunos já veem o botão “Falar com você no WhatsApp”.");
    } catch {
      setError("Não foi possível salvar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await removeMyContact(getFirebase().db, uid);
      setPhase({ status: "ready", on: false });
      setNotice("Pronto: seus alunos não veem mais o seu WhatsApp.");
    } catch {
      setError("Não foi possível desligar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="trainer-contact-title">
      <h2 id="trainer-contact-title">WhatsApp para os alunos</h2>
      {phase.status === "loading" && <p className="loading">Carregando…</p>}
      {phase.status === "error" && <p role="alert">Não foi possível carregar esta opção.</p>}
      {phase.status === "ready" && (
        <form onSubmit={(event) => void save(event)}>
          <p>
            {phase.on
              ? "Ligado: seus alunos veem um botão para falar com você no WhatsApp."
              : "Desligado. Ligue para que seus alunos possam te chamar no WhatsApp direto do site."}
          </p>
          <p>
            <label>
              Nome que seus alunos veem
              <input value={name} maxLength={CONTACT_NAME_MAX} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          </p>
          <p>
            <label>
              WhatsApp
              <input value={whatsapp} inputMode="tel" onChange={(event) => setWhatsapp(event.target.value)} autoComplete="tel" />
            </label>
          </p>
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          <div className="resume-actions">
            <button type="submit" className="button-primary" disabled={busy}>
              {busy ? "Salvando…" : phase.on ? "Salvar" : "Mostrar meu WhatsApp para os meus alunos"}
            </button>
            {phase.on && (
              <button type="button" disabled={busy} onClick={() => void turnOff()}>
                Desligar
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
