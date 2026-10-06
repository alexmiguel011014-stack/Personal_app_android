"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ACCOUNT_AVATAR_CHANGED_EVENT, accountAvatarError, accountAvatarPath, removeAccountAvatar, saveAccountAvatarPath, uploadAccountAvatar, validateAccountAvatar } from "../../data/accountAvatar";
import { getFirebase } from "../../data/firebase";
import { Avatar } from "./Avatar";

export function AccountAvatarSettings({ uid, name }: { uid: string; name: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (busy) return;
    if (!file) return;
    setError(null);
    setNotice(null);
    const invalid = validateAccountAvatar(file);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    try {
      const { db, storage } = getFirebase();
      await uploadAccountAvatar(storage, uid, file);
      await saveAccountAvatarPath(db, uid, accountAvatarPath(uid));
      window.dispatchEvent(new Event(ACCOUNT_AVATAR_CHANGED_EVENT));
      setNotice("Imagem da conta atualizada.");
    } catch (reason) { setError(accountAvatarError(reason)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { db, storage } = getFirebase();
      await removeAccountAvatar(storage, uid);
      await saveAccountAvatarPath(db, uid, null);
      window.dispatchEvent(new Event(ACCOUNT_AVATAR_CHANGED_EVENT));
      setNotice("Imagem removida. Suas iniciais serão exibidas.");
    } catch (reason) { setError(accountAvatarError(reason)); }
    finally { setBusy(false); }
  }

  return <section className="panel account-avatar-settings" aria-labelledby="account-avatar-heading">
    <h2 id="account-avatar-heading">Imagem da conta</h2>
    <div className="account-avatar-row">
      <Avatar name={name || "Minha conta"} uid={uid} />
      <div>
        <label>
          <span>{busy ? "Salvando imagem…" : "Cadastrar ou trocar imagem"}</span>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void choose(event)} aria-disabled={busy} />
        </label>
        <p className="account-muted">JPG, PNG ou WebP · até 2 MB. A imagem fica privada na sua conta.</p>
        <button type="button" onClick={() => void remove()} aria-disabled={busy}>Remover imagem</button>
      </div>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
