"use client";

import { sendPasswordResetEmail } from "firebase/auth";
import { useEffect, useState } from "react";
import { countAdmins } from "../../../data/admin";
import { getFirebase } from "../../../data/firebase";
import { AccountSettings } from "../../_shared/AccountSettings";
import { useSession } from "../../SessionProvider";
import { PageHeading } from "../AdminPrimitives";

export default function AdminAccountPage() {
  const { session } = useSession();
  const email = session.status === "signedIn" ? session.email : null;
  const [admins, setAdmins] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void countAdmins(getFirebase().db).then((count) => { if (!cancelled) setAdmins(count); })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar a contagem de administradores."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function sendReset() {
    if (!email) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await sendPasswordResetEmail(getFirebase().auth, email);
      setNotice("Enviamos um link de redefinição para seu e-mail. Sua sessão continua ativa.");
    } catch {
      setError("Não foi possível enviar o link agora. Tente novamente ou use “Esqueci minha senha” na tela de entrada.");
    } finally { setBusy(false); }
  }

  return <main>
    <PageHeading title="Minha conta">Acesso administrativo e segurança da conta.</PageHeading>
    <AccountSettings />
    <section className="panel"><h2>Conta conectada</h2><dl><div><dt>E-mail</dt><dd>{email ?? "Ainda sem dados"}</dd></div><div><dt>Administradores cadastrados</dt><dd>{loading ? "Carregando…" : admins ?? "Ainda sem dados"}</dd></div><div><dt>Autenticação em dois fatores</dt><dd>Não há informação de MFA disponível nesta versão.</dd></div></dl>
      {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy || !email} onClick={() => void sendReset()}>{busy ? "Enviando…" : "Enviar link para redefinir senha"}</button>
    </section>
  </main>;
}
