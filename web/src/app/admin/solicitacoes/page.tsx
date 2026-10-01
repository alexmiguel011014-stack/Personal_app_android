"use client";

import { useEffect, useState } from "react";
import { approveRequest, loadTrainerRequests, promoteToTrainer, rejectRequest, type TrainerRequest } from "../../../data/admin";
import { getFirebase } from "../../../data/firebase";
import { ConfirmDialog } from "../../_shared/ConfirmDialog";
import { useSession } from "../../SessionProvider";
import { PageHeading, LoadingOrError, DateTime, Empty } from "../AdminPrimitives";

type Decision = { kind: "approve" | "reject"; request: TrainerRequest } | null;

export default function RequestsPage() {
  const { session } = useSession();
  const adminUid = session.status === "signedIn" ? session.uid : "";
  const [requests, setRequests] = useState<TrainerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [names, setNames] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<Decision>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [promotionUid, setPromotionUid] = useState("");
  const [promotionName, setPromotionName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void loadTrainerRequests(getFirebase().db).then((items) => { if (!cancelled) { setRequests(items.sort((a, b) => a.createdAt - b.createdAt)); setError(null); } })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar as solicitações."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  async function execute() {
    if (!decision || !adminUid) return;
    setBusy(true); setNotice(null);
    try {
      const { kind, request } = decision;
      if (kind === "approve") {
        const name = (names[request.id] ?? request.email.split("@")[0]).trim();
        await approveRequest(getFirebase().db, adminUid, request.id, request.email, name);
        setNotice(`${request.email} foi promovido a personal.`);
      } else {
        await rejectRequest(getFirebase().db, adminUid, request.id);
        setNotice(`Solicitação de ${request.email} recusada.`);
      }
      setDecision(null); setLoading(true); setVersion((value) => value + 1);
    } catch { setNotice("Não foi possível concluir a decisão. A solicitação continua na fila."); }
    finally { setBusy(false); }
  }

  async function manualPromote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminUid || !promotionUid.trim()) return;
    setBusy(true); setNotice(null);
    try {
      await promoteToTrainer(getFirebase().db, adminUid, promotionUid.trim(), promotionName.trim() || "Personal");
      setNotice(`Conta ${promotionUid.trim()} promovida a personal.`); setPromotionUid(""); setPromotionName("");
    } catch { setNotice("Não foi possível promover este UID. Confirme se a conta já existe e tente novamente."); }
    finally { setBusy(false); }
  }

  return <main>
    <PageHeading title="Solicitações">Contas que pediram acesso à área de personal.</PageHeading>
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((value) => value + 1); }} />
    {notice && <p role="status">{notice}</p>}
    {!loading && !error && (requests.length === 0 ? <section className="panel"><Empty>Nenhuma solicitação pendente.</Empty></section> : <section className="panel"><h2>Fila · {requests.length}</h2>{requests.map((request) => <article className="admin-request" key={request.id}>
      <div><strong>{request.email}</strong><br /><small className="admin-muted">Solicitou em <DateTime at={request.createdAt || null} /> · UID {request.id}</small></div>
      <form onSubmit={(event) => { event.preventDefault(); setDecision({ kind: "approve", request }); }}>
        <label>Nome do personal<input required maxLength={100} value={names[request.id] ?? request.email.split("@")[0]} onChange={(event) => setNames((value) => ({ ...value, [request.id]: event.target.value }))} /></label>
        <button type="submit" disabled={busy}>Aprovar</button>
        <button type="button" disabled={busy} onClick={() => setDecision({ kind: "reject", request })}>Recusar</button>
      </form>
    </article>)}</section>)}
    <section className="panel"><h2>Promover por UID</h2><p>Use quando a solicitação não chegou à fila, mas a conta já existe no Firebase Authentication.</p><form onSubmit={(event) => void manualPromote(event)}><p><label>UID da conta<input required value={promotionUid} onChange={(event) => setPromotionUid(event.target.value)} /></label><label>Nome<input maxLength={100} value={promotionName} onChange={(event) => setPromotionName(event.target.value)} /></label></p><button type="submit" disabled={busy}>Promover conta</button></form></section>
    <ConfirmDialog open={decision !== null} title={decision?.kind === "approve" ? "Aprovar solicitação?" : "Recusar solicitação?"} yesLabel={busy ? "Salvando…" : decision?.kind === "approve" ? "Aprovar personal" : "Recusar solicitação"} onYes={() => void execute()} onNo={() => setDecision(null)}>
      {decision?.kind === "approve" ? <p>A conta {decision.request.email} receberá acesso à área de personal. O nome informado será salvo no perfil.</p> : <p>A solicitação de {decision?.request.email} será removida da fila. A conta não será excluída.</p>}
    </ConfirmDialog>
  </main>;
}
