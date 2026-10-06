"use client";

import { FirebaseError } from "firebase/app";
import { useEffect, useState, type FormEvent } from "react";
import { loadPersonalAccount, savePersonalName } from "../../data/account";
import { getFirebase } from "../../data/firebase";
import { canChangeName, daysUntilNameChange, NAME_CHANGE_INTERVAL_DAYS, nextNameChangeAt, normalizeAccountName } from "../../domain/accountName";
import { ConfirmDialog } from "./ConfirmDialog";
import { FocusNotice } from "./FocusNotice";

// GOALS.md §29g: a user corrects their own name — once every 60 days. The wait is enforced by firestore.rules (v5) with the
// server's clock; this screen only explains it, asks before using it up, and reads the rules' refusal back as a sentence.

const dateLabel = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function AccountNameSettings({ uid }: { uid: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [changedAt, setChangedAt] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPersonalAccount(getFirebase().db, uid)
      .then((account) => {
        if (cancelled) return;
        setSavedName(account.name);
        setDraft(account.name);
        setChangedAt(account.nameChangedAt);
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar o seu nome. Verifique a conexão e tente novamente."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const locked = !canChangeName(changedAt, now);
  const unlockAt = nextNameChangeAt(changedAt);
  const unavailable = loading || busy || locked;

  function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable) return;
    setError(null);
    setNotice(null);
    let name: string;
    try {
      name = normalizeAccountName(draft);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Nome inválido.");
      return;
    }
    if (name === savedName) { setError("Esse já é o seu nome atual."); return; }
    setPendingName(name);
  }

  async function confirm() {
    const name = pendingName;
    setPendingName(null);
    if (!name || busy) return;
    setBusy(true);
    try {
      const saved = await savePersonalName(getFirebase().db, uid, name);
      setSavedName(saved.name);
      setDraft(saved.name);
      setChangedAt(saved.nameChangedAt);
      setNow(Date.now());
      const next = nextNameChangeAt(saved.nameChangedAt);
      setNotice(`Nome alterado.${next === null ? "" : ` Você poderá alterá-lo de novo a partir de ${dateLabel(next)}.`}`);
    } catch (problem) {
      if (problem instanceof FirebaseError && problem.code === "permission-denied") {
        setError(`Não foi possível alterar o nome agora. O nome só pode ser alterado uma vez a cada ${NAME_CHANGE_INTERVAL_DAYS} dias.`);
        // The rules refused: show the real state instead of guessing it.
        void loadPersonalAccount(getFirebase().db, uid).then((account) => { setChangedAt(account.nameChangedAt); setDraft(account.name); setSavedName(account.name); }).catch(() => undefined);
      } else {
        setError("Não foi possível alterar o nome. Verifique a conexão e tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="account-name-title">
      <h2 id="account-name-title">Nome</h2>
      <p id="account-name-help">
        É o nome que seu personal e a administração veem. Você pode alterá-lo uma vez a cada {NAME_CHANGE_INTERVAL_DAYS} dias.
      </p>
      {locked && unlockAt !== null && (
        <p>
          Você alterou o nome em {dateLabel(changedAt ?? now)}. Poderá alterá-lo de novo a partir de <strong>{dateLabel(unlockAt)}</strong>
          {" "}(faltam {daysUntilNameChange(changedAt, now)} {daysUntilNameChange(changedAt, now) === 1 ? "dia" : "dias"}).
        </p>
      )}
      {error && <FocusNotice role="alert">{error}</FocusNotice>}
      {notice && <FocusNotice>{notice}</FocusNotice>}
      <form onSubmit={ask}>
        <p>
          <label>
            Nome
            <input
              type="text"
              autoComplete="name"
              maxLength={80}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              readOnly={unavailable}
              aria-describedby="account-name-help"
            />
          </label>
        </p>
        <button type="submit" aria-disabled={unavailable}>{loading ? "Carregando…" : busy ? "Salvando…" : "Salvar nome"}</button>
      </form>
      <ConfirmDialog
        open={pendingName !== null}
        title="Alterar seu nome?"
        yesLabel="Alterar nome"
        noLabel="Cancelar"
        onYes={() => void confirm()}
        onNo={() => setPendingName(null)}
      >
        <p>Seu nome passará a ser <strong>{pendingName}</strong>.</p>
        <p>Depois disso você só poderá alterá-lo de novo daqui a {NAME_CHANGE_INTERVAL_DAYS} dias.</p>
      </ConfirmDialog>
    </section>
  );
}
