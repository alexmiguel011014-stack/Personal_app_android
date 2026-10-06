"use client";

import { useState, type FormEvent } from "react";
import { createAdminRecoveryDraft } from "../../../../data/adminCreateStudent";
import { getFirebase } from "../../../../data/firebase";
import { useSession } from "../../../SessionProvider";
import { FocusNotice } from "../../../_shared/FocusNotice";

export function AdminCreateStudentRecovery({ trainerUid, trainerName, canManage }: {
  trainerUid: string;
  trainerName: string;
  canManage: boolean;
}) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.status !== "signedIn" || !canManage || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const studentId = await createAdminRecoveryDraft(getFirebase().db, session.uid, trainerUid, {
        name,
        gender: "",
        phone,
        goal: "",
        experienceLevel: "",
        medicalNotes: "",
        trainingDays: [],
      }, reason);
      setName(""); setPhone(""); setReason("");
      setNotice(`Cadastro mínimo criado para ${trainerName}. UID do rascunho: ${studentId}. O aluno ainda precisará receber e confirmar um convite normal.`);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Não foi possível cadastrar o aluno.");
    } finally { setBusy(false); }
  }

  return <section className="panel">
    <h2>Cadastro de segurança</h2>
    <p>Cria somente um rascunho ligado a <strong>{trainerName}</strong>. Não cria conta ou senha de aluno nem lê dados de outros alunos. Este rascunho não reserva vaga nem gera cobrança. Para conectar o aluno, o personal deverá enviar um convite normal; nesse momento valem o limite de convites e a política de vagas e cobranças adicionais do plano.</p>
    {!open ? <button type="button" disabled={!canManage} onClick={() => { setOpen(true); setError(null); setNotice(null); }}>Cadastrar aluno</button> : <form onSubmit={(event) => void submit(event)}>
      <p>
        <label>Nome do aluno<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Telefone (opcional)<input type="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Motivo do cadastro<input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="page-actions">
        <button type="submit" aria-disabled={busy}>{busy ? "Salvando…" : "Criar rascunho"}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancelar</button>
      </div>
    </form>}
    {notice && <FocusNotice>{notice}</FocusNotice>}
  </section>;
}
