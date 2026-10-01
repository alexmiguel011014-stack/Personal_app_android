"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countAdmins, countLinkedStudents, loadActivity, loadLatestAudit, loadTrainerRequests, loadTrainerStats, loadTrainers, type TrainerRequest } from "../../data/admin";
import { getFirebase } from "../../data/firebase";
import type { AuditEntry, TrainerActivity, TrainerStats, TrainerUser } from "../../data/converters";
import { yearMonth } from "../../domain/dates";
import { OVERDUE_ALERT_CENTS } from "../../domain/adminMetrics";
import { PageHeading, LoadingOrError, Money, DateTime, Empty } from "./AdminPrimitives";
import { browserTimeZone } from "../_shared/browserTimeZone";
import { localDate } from "../../domain/dates";

type OverviewData = { trainers: TrainerUser[]; stats: TrainerStats[]; requests: TrainerRequest[]; audit: AuditEntry[]; admins: number; linked: number; activities: TrainerActivity[] };
const zeroData = (): OverviewData => ({ trainers: [], stats: [], requests: [], audit: [], admins: 0, linked: 0, activities: [] });
const actionName: Record<string, string> = { "trainer.create": "Personal cadastrado", "trainer.suspend": "Acesso suspenso", "trainer.reactivate": "Acesso reativado", "trainer.promote": "Personal promovido", "request.reject": "Solicitação recusada", "trainer.resetEmail": "Redefinição de senha enviada" };

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData>(zeroData);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(0);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebase().db;
        const [trainers, stats, requests, audit, admins] = await Promise.all([loadTrainers(db), loadTrainerStats(db), loadTrainerRequests(db), loadLatestAudit(db), countAdmins(db)]);
        const loadedAt = Date.now();
        const linkedCounts = await Promise.all(trainers.map((trainer) => countLinkedStudents(db, trainer.id)));
        const month = yearMonth(localDate(loadedAt, browserTimeZone()));
        const activities = (await Promise.all(trainers.map((trainer) => loadActivity(db, trainer.id, [month])))).flat();
        if (!cancelled) {
          setData({ trainers, stats, requests, audit, admins, linked: linkedCounts.reduce((sum, value) => sum + value, 0), activities });
          setAsOf(loadedAt);
          setError(null);
        }
      } catch { if (!cancelled) setError("Não foi possível carregar os dados administrativos. Confira as regras do Firestore e tente novamente."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [version]);

  const month = yearMonth(localDate(asOf, browserTimeZone()));
  const currentStats = data.stats.filter((item) => item.billing.month === month);
  const accessActive = data.trainers.filter((trainer) => trainer.accessStatus !== "suspended").length;
  const active7d = data.trainers.filter((trainer) => trainer.accessStatus !== "suspended" && data.stats.some((item) => item.trainerId === trainer.id && item.lastSeenAt !== null && asOf - item.lastSeenAt <= 7 * 86_400_000)).length;
  const recentSummaries = data.trainers.filter((trainer) => data.stats.some((item) => item.trainerId === trainer.id && asOf - item.updatedAt <= 14 * 86_400_000)).length;
  const suspended = data.trainers.length - accessActive;
  const expected = currentStats.reduce((sum, item) => sum + item.billing.expectedCents, 0);
  const received = currentStats.reduce((sum, item) => sum + item.billing.receivedCents, 0);
  const overdue = currentStats.reduce((sum, item) => sum + item.billing.overdueCents, 0);
  const usage = data.activities.reduce((sum, item) => sum + Object.values(item.actions).reduce((n, count) => n + count, 0), 0);
  const attention = data.trainers.filter((trainer) => {
    const stats = data.stats.find((item) => item.trainerId === trainer.id);
    return trainer.accessStatus !== "suspended" && (stats === undefined || asOf - stats.updatedAt > 14 * 86_400_000 || stats.billing.overdueCents > OVERDUE_ALERT_CENTS || stats.lastSeenAt == null || asOf - stats.lastSeenAt > 14 * 86_400_000);
  });
  const topUsage = [...data.activities].sort((a, b) => Object.values(b.actions).reduce((n, count) => n + count, 0) - Object.values(a.actions).reduce((n, count) => n + count, 0));

  return <main>
    <PageHeading title="Visão geral">Acompanhamento da plataforma e da rede de personais.</PageHeading>
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((n) => n + 1); }} />
    {!loading && !error && <>
      <dl className="admin-grid">
        <div className="admin-figure"><dt>Com acesso ativo</dt><dd>{accessActive}</dd></div>
        <div className="admin-figure"><dt>Suspensos</dt><dd>{suspended}</dd></div>
        <div className="admin-figure"><dt>Ativos nos últimos 7 dias</dt><dd>{active7d}</dd></div>
        <div className="admin-figure"><dt>Alunos vinculados</dt><dd>{data.linked}</dd></div>
        <div className="admin-figure"><dt>Atividade neste mês</dt><dd>{usage}</dd></div>
        <div className="admin-figure"><dt>Solicitações pendentes</dt><dd>{data.requests.length}</dd></div>
      </dl>
      <p className="admin-muted">Resumos atualizados nos últimos 14 dias: {recentSummaries} de {data.trainers.length} personais.</p>
      <dl className="admin-grid" aria-label="Resumo de mensalidades do mês">
        <div className="admin-figure"><dt>Previsto no mês</dt><dd><Money cents={currentStats.length ? expected : null} /></dd></div>
        <div className="admin-figure"><dt>Recebido</dt><dd><Money cents={currentStats.length ? received : null} /></dd></div>
        <div className="admin-figure"><dt>Em atraso</dt><dd><Money cents={currentStats.length ? overdue : null} /></dd></div>
      </dl>
      <div className="admin-columns">
        <section className="panel"><h2>Precisam de atenção</h2>
          {attention.length === 0 ? <Empty>Nenhum personal ativo precisa de atenção no momento.</Empty> : <ul className="admin-list">{attention.slice(0, 8).map((trainer) => {
            const stats = data.stats.find((item) => item.trainerId === trainer.id);
            const lastSeen = stats?.lastSeenAt ?? null;
            const labels = [!stats || asOf - stats.updatedAt > 14 * 86_400_000 ? "Resumo desatualizado" : "", (stats?.billing.overdueCents ?? 0) > OVERDUE_ALERT_CENTS ? "Cobrança em atraso" : "", lastSeen === null ? "Nunca entrou" : asOf - lastSeen > 14 * 86_400_000 ? "Sem atividade há 14+ dias" : ""].filter(Boolean);
            return <li key={trainer.id}><span><Link href={`/admin/personais/detalhe?id=${encodeURIComponent(trainer.id)}`}>{trainer.name || trainer.email}</Link><br /><small>{lastSeen === null ? "Nunca entrou" : <>Última visita: <DateTime at={lastSeen} /></>}</small></span><span className="admin-status">{labels.join(" · ")}</span></li>;
          })}</ul>}
        </section>
        <section className="panel"><h2>Uso mensal por personal</h2>
          {topUsage.length === 0 ? <Empty>Ainda sem dados de uso deste mês.</Empty> : <ol className="admin-list">{topUsage.map((item) => {
            const trainer = data.trainers.find((entry) => entry.id === item.trainerId);
            const count = Object.values(item.actions).reduce((sum, n) => sum + n, 0);
            return <li key={item.trainerId}><span><Link href={`/admin/personais/detalhe?id=${encodeURIComponent(item.trainerId)}`}>{trainer?.name || trainer?.email || item.trainerId}</Link></span><strong>{count} ações · {item.actions.geminiGenerated} Gemini</strong></li>;
          })}</ol>}
          <p className="section-footnote">São contagens agregadas de ações, sem conteúdo ou dados de alunos.</p>
        </section>
      </div>
      <section className="panel"><h2>Auditoria recente</h2>
        {data.audit.length === 0 ? <Empty>Ainda sem registros de auditoria.</Empty> : <ul className="admin-list">{data.audit.map((entry) => <li key={entry.id}><span><strong>{actionName[entry.action] ?? entry.action}</strong><br /><small>{entry.note || entry.targetUid} · UID {entry.targetUid}</small></span><small><DateTime at={entry.at} /></small></li>)}</ul>}
      </section>
      <section className="panel"><h2>Atalhos úteis</h2><ul><li><a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Console do Firebase</a></li><li><a href="https://aistudio.google.com/rate-limit" target="_blank" rel="noreferrer">Limites e uso do Gemini no AI Studio</a></li><li><a href="https://alexmiguel011014-stack.github.io/Personal_app_android/" target="_blank" rel="noreferrer">Site publicado</a></li></ul><p className="admin-muted">Administradores cadastrados: {data.admins}</p></section>
    </>}
  </main>;
}
