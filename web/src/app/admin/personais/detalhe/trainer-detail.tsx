"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { countLinkedStudents, loadActivity, loadTrainerAudit, loadTrainerStats, loadTrainers, setAccessStatus } from "../../../../data/admin";
import { recordAudit } from "../../../../data/admin";
import { authErrorMessage } from "../../../../data/authErrors";
import { getFirebase } from "../../../../data/firebase";
import type { AuditEntry, TrainerActivity, TrainerStats, TrainerUser } from "../../../../data/converters";
import { ConfirmDialog } from "../../../_shared/ConfirmDialog";
import { useSession } from "../../../SessionProvider";
import { addDays, localDate, yearMonth } from "../../../../domain/dates";
import { PageHeading, LoadingOrError, Money, DateTime, Empty } from "../../AdminPrimitives";
import { browserTimeZone } from "../../../_shared/browserTimeZone";
import { ACTIVITY_KINDS, type ActivityKind } from "../../../../domain/activity";
import { PlatformSubscriptionPanel } from "./PlatformSubscriptionPanel";
import { AdminCreateStudentRecovery } from "./AdminCreateStudentRecovery";

const auditNames: Record<string, string> = {
  "trainer.create": "Cadastro",
  "trainer.suspend": "Suspensão",
  "trainer.reactivate": "Reativação",
  "trainer.promote": "Promoção",
  "request.reject": "Solicitação recusada",
  "trainer.resetEmail": "Redefinição de senha",
  "admin.student.create": "Cadastro de aluno de segurança",
  "invite.create": "Convite criado no site",
  "invite.claim": "Convite aceito no site",
  "invite.cancel": "Convite cancelado",
  "invite.resolve": "Convite resolvido pelo ADM",
  "subscription.assign": "Plano ou teste atribuído",
  "invoice.issue": "Fatura emitida",
  "invoice.payment": "Pagamento registrado",
  "invoice.extend": "Vencimento prorrogado",
  "trial.extend": "Teste prorrogado",
};
const activityLabels: Record<ActivityKind, string> = {
  login: "Entradas",
  studentCreated: "Alunos criados",
  inviteGenerated: "Convites gerados",
  fichaSaved: "Fichas salvas",
  geminiGenerated: "Gerações Gemini",
  chargePaid: "Mensalidades pagas",
  bookingAdded: "Agendamentos",
  measurementAdded: "Medições registradas",
  assessmentRequested: "Avaliações solicitadas",
};

export default function TrainerDetail({ trainerId }: { trainerId: string }) {
  const { session } = useSession();
  const adminUid = session.status === "signedIn" ? session.uid : "";
  const [trainer, setTrainer] = useState<TrainerUser | null>(null);
  const [stats, setStats] = useState<TrainerStats | null>(null);
  const [linked, setLinked] = useState<number | null>(null);
  const [activities, setActivities] = useState<TrainerActivity[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [asOf, setAsOf] = useState(0);
  const [loading, setLoading] = useState(Boolean(trainerId));
  const [error, setError] = useState<string | null>(trainerId ? null : "O identificador do personal não foi informado.");
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [auditWarning, setAuditWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!trainerId) return;
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebase().db;
        const now = Date.now();
        const day = localDate(now, browserTimeZone());
        const months = Array.from({ length: 3 }, (_, index) => yearMonth(addDays(day, -index * 30)));
        const [trainers, allStats, recentActivity, liveLinked, audits] = await Promise.all([
          loadTrainers(db), loadTrainerStats(db), loadActivity(db, trainerId, [...new Set(months)]), countLinkedStudents(db, trainerId), loadTrainerAudit(db, trainerId),
        ]);
        const found = trainers.find((item) => item.id === trainerId) ?? null;
        if (!found) throw new Error("Personal não encontrado.");
        if (!cancelled) { setTrainer(found); setStats(allStats.find((item) => item.trainerId === trainerId) ?? null); setActivities(recentActivity); setLinked(liveLinked); setAudit(audits); setAsOf(now); setError(null); }
      } catch (err) { if (!cancelled) setError(err instanceof Error && err.message === "Personal não encontrado." ? err.message : "Não foi possível carregar os dados deste personal."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [trainerId, version]);

  const today = localDate(asOf, browserTimeZone());
  const last30Days = useMemo(() => Array.from({ length: 30 }, (_, index) => addDays(today, index - 29)), [today]);
  const activeDays = new Set(activities.flatMap((item) => item.activeDays));
  const currentActivity = activities.filter((item) => item.month === yearMonth(today));
  const monthRows = [...activities].sort((a, b) => b.month.localeCompare(a.month));
  const canManage = !!trainer && trainer.id !== adminUid;

  async function updateStatus() {
    if (!trainer || !adminUid) return;
    if (busy) return;
    if (trainer.accessStatus === "active" && !reason.trim()) { setActionError("Informe o motivo da suspensão."); return; }
    setBusy(true); setActionError(null);
    try {
      const next = trainer.accessStatus === "suspended" ? "active" : "suspended";
      await setAccessStatus(getFirebase().db, adminUid, trainer.id, next, reason.trim());
      setDialog(false); setReason(""); setLoading(true); setVersion((value) => value + 1);
    } catch { setActionError("Não foi possível alterar o acesso. Confira as regras e tente novamente."); }
    finally { setBusy(false); }
  }

  async function resendPasswordReset() {
    if (!trainer?.email || !adminUid || resetBusy) return;
    setResetBusy(true);
    setResetNotice(null);
    setResetError(null);
    setAuditWarning(null);
    try {
      await sendPasswordResetEmail(getFirebase().auth, trainer.email);
      setResetNotice(`Link de redefinição enviado para ${trainer.email}.`);
      try {
        await recordAudit(getFirebase().db, {
          adminUid,
          actorUid: adminUid,
          actorRole: "ADM",
          action: "trainer.resetEmail",
          targetUid: trainer.id,
          at: Date.now(),
          note: `Link de redefinição enviado para ${trainer.email}`,
        });
      } catch {
        setAuditWarning("O e-mail foi enviado, mas não foi possível registrar esta ação na auditoria.");
      }
    } catch (error) {
      setResetError(authErrorMessage(error));
    } finally {
      setResetBusy(false);
    }
  }

  return <main>
    <PageHeading eyebrow="Personais" title={trainer?.name || "Detalhe do personal"}><Link href="/admin/personais">Voltar ao diretório</Link></PageHeading>
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((value) => value + 1); }} />
    {!loading && !error && trainer && <>
      <section className="panel"><div className="admin-columns"><div><h2>{trainer.name || "Sem nome"}</h2><p>{trainer.email || "Ainda sem dados"}</p><p><span className="admin-status" data-state={trainer.accessStatus}>{trainer.accessStatus === "active" ? "Acesso ativo" : "Acesso suspenso"}</span></p><dl><div><dt>UID</dt><dd>{trainer.id}</dd></div><div><dt>Criado em</dt><dd><DateTime at={trainer.createdAt || null} /></dd></div><div><dt>Criado por · UID</dt><dd>{trainer.createdBy || "Ainda sem dados"}</dd></div><div><dt>Última visita</dt><dd><DateTime at={stats?.lastSeenAt ?? null} /></dd></div>{trainer.suspendedReason && <div><dt>Motivo da suspensão</dt><dd>{trainer.suspendedReason}</dd></div>}</dl></div>
        {canManage && <div className="admin-actions"><button type="button" onClick={() => { setReason(""); setActionError(null); setDialog(true); }}>{trainer.accessStatus === "suspended" ? "Reativar acesso" : "Suspender acesso"}</button><button type="button" disabled={resetBusy || !trainer.email} onClick={() => void resendPasswordReset()}>{resetBusy ? "Enviando link…" : "Reenviar redefinição de senha"}</button></div>}</div>
        {actionError && <p role="alert">{actionError}</p>}
        {resetNotice && <p role="status">{resetNotice}</p>}
        {resetError && <p role="alert">{resetError}</p>}
        {auditWarning && <p role="alert">{auditWarning}</p>}
      </section>
      <section className="panel"><h2>Alunos vinculados</h2><p><strong>{linked ?? "Ainda sem dados"}</strong> ativos vinculados agora · {stats?.students.linked ?? "Ainda sem dados"} informado no último resumo.</p></section>
      <PlatformSubscriptionPanel trainerUid={trainer.id} adminUid={adminUid} linkedStudentSeats={linked} accessStatus={trainer.accessStatus} billingStatus={trainer.platformBillingStatus ?? null} billingUntil={trainer.platformBillingUntil ?? null} canManage={canManage} />
      <AdminCreateStudentRecovery trainerUid={trainer.id} trainerName={trainer.name || trainer.email || trainer.id} canManage={canManage} />
      <section className="panel"><h2>Atividade recente</h2>
        {activities.length === 0 ? <Empty>Ainda sem dados de atividade.</Empty> : <>
          <p>Últimos 30 dias; as marcas indicam dias com atividade registrada.</p>
          <ol className="admin-days" aria-label={`Atividade diária nos últimos 30 dias. ${activeDays.size} dias com atividade.`}>{last30Days.map((day) => <li key={day} data-active={activeDays.has(day)} aria-label={`${day}: ${activeDays.has(day) ? "com atividade" : "sem atividade registrada"}`} title={`${day}: ${activeDays.has(day) ? "com atividade" : "sem atividade"}`} />)}</ol>
          <div className="admin-scroll"><table className="stack"><caption>Contagens mensais por tipo de ação</caption><thead><tr><th scope="col">Mês</th>{ACTIVITY_KINDS.map((kind) => <th scope="col" key={kind}>{activityLabels[kind]}</th>)}<th scope="col">Total de ações</th><th scope="col">Dias ativos</th></tr></thead><tbody>{monthRows.map((item) => <tr key={item.month}><th scope="row">{item.month}</th>{ACTIVITY_KINDS.map((kind) => <td key={kind} data-label={activityLabels[kind]}>{item.actions[kind]}</td>)}<td data-label="Total de ações">{Object.values(item.actions).reduce((sum, count) => sum + count, 0)}</td><td data-label="Dias ativos">{item.activeDays.length}</td></tr>)}</tbody></table></div>
          {currentActivity.length > 0 && <p className="admin-muted">Resumo mensal atualizado em <DateTime at={currentActivity[0].updatedAt} /></p>}
        </>}
      </section>
      <section className="panel"><h2>Mensalidades · {stats?.billing.month ?? "Ainda sem dados"}</h2>
        {!stats ? <Empty>Ainda sem dados de cobrança para este personal.</Empty> : <dl><div><dt>Planos ativos</dt><dd>{stats.billing.activePlans}</dd></div><div><dt>Ticket médio</dt><dd><Money cents={stats.billing.activePlans ? Math.round(stats.billing.planCents / stats.billing.activePlans) : null} /></dd></div><div><dt>Previsto</dt><dd><Money cents={stats.billing.expectedCents} /></dd></div><div><dt>Recebido</dt><dd><Money cents={stats.billing.receivedCents} /></dd></div><div><dt>Em atraso</dt><dd><Money cents={stats.billing.overdueCents} /></dd></div><div><dt>Taxa de recebimento</dt><dd>{stats.billing.expectedCents ? `${Math.round(100 * stats.billing.receivedCents / stats.billing.expectedCents)}%` : "Ainda sem dados"}</dd></div><div><dt>Atualização</dt><dd><DateTime at={stats.updatedAt} />{asOf - stats.updatedAt > 14 * 86_400_000 && <span className="attention"> Resumo desatualizado há mais de 14 dias</span>}</dd></div></dl>}
      </section>
    <section className="panel"><h2>Auditoria deste personal</h2>{audit.length === 0 ? <Empty>Ainda sem registros de auditoria.</Empty> : <ul className="admin-list">{audit.map((entry) => <li key={entry.id}><span><strong>{auditNames[entry.action] ?? entry.action}</strong><br /><small>{entry.note}</small></span><small><DateTime at={entry.at} /> · {entry.actorRole} {entry.actorUid}</small></li>)}</ul>}</section>
    </>}
    <ConfirmDialog open={dialog} title={trainer?.accessStatus === "suspended" ? "Reativar acesso deste personal?" : "Suspender acesso deste personal?"} yesLabel={busy ? "Salvando…" : "Confirmar"} onYes={() => void updateStatus()} onNo={() => setDialog(false)}>
      {trainer?.accessStatus === "suspended" ? <p>O personal poderá voltar a acessar a plataforma.</p> : <><p>A conta perderá acesso à área de personal até ser reativada.</p><label>Motivo (até 200 caracteres)<textarea required maxLength={200} value={reason} onChange={(event) => { setReason(event.target.value); setActionError(null); }} /></label><p className="admin-muted">{reason.length}/200</p>{actionError && <p role="alert">{actionError}</p>}</>}
    </ConfirmDialog>
  </main>;
}
