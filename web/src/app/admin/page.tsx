"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countAdmins, countLinkedStudents, loadActivity, loadLatestAudit, loadTrainerRequests, loadTrainerStats, loadTrainers, type TrainerRequest } from "../../data/admin";
import { loadAllPlatformSubscriptions, loadPlatformPayments, type PlatformPayment, type PlatformSubscription } from "../../data/platformSubscriptions";
import { getFirebase } from "../../data/firebase";
import type { AuditEntry, TrainerActivity, TrainerStats, TrainerUser } from "../../data/converters";
import { adminAttention, adminKpis, auditRows, platformRows, revenueByMonth, staleSummaryCount, stateSegments, studentChargeTotals, usageRanking, ACTIVE_WINDOWS, REVENUE_MONTHS, type AdminHomeInput } from "../../domain/adminHome";
import { addMonths, localDate, yearMonth } from "../../domain/dates";
import { barChartLabel, compactReais, progressLabel, sparklineLabel, stackedBarLabel } from "../../domain/chartText";
import { formatCents } from "../../domain/payments";
import { PageHeading, LoadingOrError, Money, DateTime, Empty } from "./AdminPrimitives";
import { browserTimeZone } from "../_shared/browserTimeZone";
import { shortMonth } from "../_shared/dateLabels";
import { AttentionList } from "../_shared/dashboard/AttentionList";
import { BarChart, ProgressBar, Sparkline, StackedBar, type SegmentTone } from "../_shared/dashboard/charts";
import { KpiCard, KpiGrid } from "../_shared/dashboard/KpiCard";

// GOALS.md §37d: the ADM's overview. Four figures (the money first), who needs the ADM, the platform's receivables
// beside the personais' states, usage, and the audit trail; the personais' own charges to their alunos — which are not
// the ADM's money — fold into "Mais". Every number comes from `domain/adminHome.ts`.

type OverviewData = {
  trainers: TrainerUser[];
  stats: TrainerStats[];
  requests: TrainerRequest[];
  audit: AuditEntry[];
  admins: number;
  linkedByTrainer: Map<string, number>;
  activities: TrainerActivity[];
  subscriptions: Map<string, PlatformSubscription> | null;
  payments: PlatformPayment[] | null;
};

const zeroData = (): OverviewData => ({ trainers: [], stats: [], requests: [], audit: [], admins: 0, linkedByTrainer: new Map(), activities: [], subscriptions: null, payments: null });

const STATE_TONES: Record<string, SegmentTone> = { atrasado: "alert", vence_breve: "warning", aguardando: "warning", teste: "info", em_dia: "success", sem_plano: "muted" };

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
        const [trainers, stats, requests, audit, admins, subscriptions, payments] = await Promise.all([
          loadTrainers(db),
          loadTrainerStats(db),
          loadTrainerRequests(db),
          loadLatestAudit(db),
          countAdmins(db),
          loadAllPlatformSubscriptions(db).catch(() => null),
          loadPlatformPayments(db).catch(() => null),
        ]);
        const loadedAt = Date.now();
        const thisMonth = yearMonth(localDate(loadedAt, browserTimeZone()));
        const months = [thisMonth, yearMonth(addMonths(`${thisMonth}-01`, -1)), yearMonth(addMonths(`${thisMonth}-01`, -2))];
        const perTrainer = await Promise.all(trainers.map(async (trainer) => ({
          id: trainer.id,
          linked: await countLinkedStudents(db, trainer.id),
          activities: await loadActivity(db, trainer.id, months),
        })));
        if (!cancelled) {
          setData({
            trainers, stats, requests, audit, admins, subscriptions, payments,
            linkedByTrainer: new Map(perTrainer.map((entry) => [entry.id, entry.linked])),
            activities: perTrainer.flatMap((entry) => entry.activities),
          });
          setAsOf(loadedAt);
          setError(null);
        }
      } catch { if (!cancelled) setError("Não foi possível carregar os dados administrativos. Confira as regras do Firestore e tente novamente."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [version]);

  const timeZone = browserTimeZone();
  const today = localDate(asOf, timeZone);
  const input: AdminHomeInput = {
    trainers: data.trainers,
    stats: data.stats,
    subscriptions: data.subscriptions,
    payments: data.payments,
    linkedByTrainer: data.linkedByTrainer,
    activities: data.activities,
    requests: data.requests.length,
  };
  const ready = !loading && !error;
  const kpis = ready ? adminKpis(input, asOf, timeZone) : null;
  const rows = ready ? platformRows(input, asOf, timeZone) : null;
  const attention = ready ? adminAttention(input, asOf, timeZone) : [];
  const usage = ready ? usageRanking(input, asOf, timeZone) : { rows: [], idle: 0 };
  const segments = rows ? stateSegments(rows) : [];
  const revenue = ready && data.payments ? revenueByMonth(data.payments, today, timeZone) : null;
  const studentCharges = ready ? studentChargeTotals(data.stats, yearMonth(today)) : null;
  const withAccess = data.trainers.filter((trainer) => trainer.accessStatus !== "suspended").length;

  return <main>
    <PageHeading title="Visão geral">Acompanhamento da plataforma e da rede de personais.</PageHeading>
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((n) => n + 1); }} />
    {kpis && <>
      <KpiGrid label="Resumo da plataforma">
        <KpiCard
          label={`Recebido no mês`}
          href="/admin/mensalidades"
          value={kpis.revenue === null || kpis.revenue.receivedCents === null ? "—" : <>{formatCents(kpis.revenue.receivedCents)}<small>de {formatCents(kpis.revenue.expectedCents)}</small></>}
          sub={kpis.revenue === null ? "Planos indisponíveis: confira as regras do Firestore." : `${kpis.revenue.receivedCents === null ? "Pagamentos indisponíveis · " : ""}Carteira mensal ${formatCents(kpis.revenue.planCents)}`}
        >
          {kpis.revenue?.receivedCents != null && <ProgressBar part={kpis.revenue.receivedCents} total={kpis.revenue.expectedCents} label={`Recebido no mês: ${progressLabel(kpis.revenue.receivedCents, kpis.revenue.expectedCents, formatCents)}`} />}
        </KpiCard>
        <KpiCard
          label="Personais pagantes"
          href="/admin/mensalidades"
          value={kpis.payers === null ? "—" : kpis.payers.paying}
          sub={kpis.payers === null ? "Planos indisponíveis." : `${kpis.payers.trial} em teste · ${kpis.payers.waiting} aguardando · ${kpis.payers.late} em atraso`}
        />
        <KpiCard
          label="Ativos nos últimos 7 dias"
          href="/admin/personais"
          value={<>{kpis.active.current}<small>de {kpis.active.withAccess}</small></>}
          sub="Personais com acesso liberado"
        >
          <Sparkline label={sparklineLabel(`Personais com atividade a cada 7 dias, últimas ${ACTIVE_WINDOWS} semanas`, kpis.active.windows.map((window) => window.count))} values={kpis.active.windows.map((window) => window.count)} />
        </KpiCard>
        <KpiCard
          label="Alunos na plataforma"
          href="/admin/personais"
          value={kpis.students}
          sub={`${withAccess} ${withAccess === 1 ? "personal com acesso" : "personais com acesso"}`}
        />
      </KpiGrid>

      <div className="home-grid">
        <div className="home-stack">
          <AttentionList id="admin-attention-title" title="Precisa de você" items={attention} empty="Nenhum personal ativo precisa de atenção no momento." />
          {staleSummaryCount(input, asOf) > 0 && <p className="admin-muted">Resumo de uso desatualizado (14+ dias) ou ausente em {staleSummaryCount(input, asOf)} de {withAccess} personais com acesso.</p>}
        </div>
        <section className="panel" aria-labelledby="platform-billing-heading">
          <div className="section-heading"><h2 id="platform-billing-heading">Mensalidades da plataforma</h2></div>
          <p className="admin-muted">O que cada personal paga a você. <Link href="/admin/mensalidades">Abrir Mensalidades</Link></p>
          {rows === null ? <Empty>Planos indisponíveis.</Empty> : segments.length === 0 ? <Empty>Nenhum personal cadastrado.</Empty> : (
            <StackedBar
              label={stackedBarLabel("Mensalidades da plataforma", segments)}
              segments={segments.map((segment) => ({ key: segment.state, name: segment.name, count: segment.count, tone: STATE_TONES[segment.state] ?? "muted", href: "/admin/mensalidades" }))}
            />
          )}
        </section>
      </div>

      <div className="home-grid">
        <section className="panel" aria-labelledby="revenue-heading">
          <div className="section-heading"><h2 id="revenue-heading">Receita por mês</h2><span className="quiet-count">R$ recebidos</span></div>
          {revenue === null ? <Empty>Pagamentos indisponíveis. Confira se as regras foram publicadas.</Empty> : (
            <BarChart
              label={barChartLabel(`Recebido por mês, últimos ${REVENUE_MONTHS} meses`, revenue.map((bar) => ({ label: shortMonth(bar.month), value: bar.cents })), formatCents)}
              bars={revenue.map((bar) => ({ key: bar.month, label: shortMonth(bar.month), value: bar.cents, valueLabel: compactReais(bar.cents) }))}
            />
          )}
        </section>
        <section className="panel" aria-labelledby="usage-heading">
          <div className="section-heading"><h2 id="usage-heading">Uso nos últimos 30 dias</h2></div>
          {usage.rows.length === 0 ? <Empty>Ainda sem dados de uso no período.</Empty> : <ol className="admin-list">{usage.rows.map((row) => (
            <li key={row.trainerId}><span><Link href={`/admin/personais/detalhe?id=${encodeURIComponent(row.trainerId)}`}>{row.name}</Link></span><strong>{row.actions} ações · {row.activeDays} {row.activeDays === 1 ? "dia ativo" : "dias ativos"}</strong></li>
          ))}</ol>}
          <p className="section-footnote">{usage.idle > 0 ? `${usage.idle} ${usage.idle === 1 ? "personal sem uso" : "personais sem uso"} no período. ` : ""}São contagens agregadas de ações, sem conteúdo ou dados de alunos.</p>
        </section>
      </div>

      <section className="panel" aria-labelledby="audit-heading">
        <div className="section-heading"><h2 id="audit-heading">Atividade recente</h2></div>
        {data.audit.length === 0 ? <Empty>Ainda sem registros de auditoria.</Empty> : <ul className="admin-list">{auditRows(data.audit, data.trainers).map((row) => (
          <li key={row.id}><span><strong>{row.title}</strong><br /><small>{row.subject}{row.note ? ` · ${row.note}` : ""}</small></span><small><DateTime at={row.at} /></small></li>
        ))}</ul>}
      </section>

      <details className="panel more-panel">
        <summary>Mais: cobranças dos personais aos alunos e atalhos</summary>
        <h3>Cobranças dos personais aos alunos</h3>
        <p className="admin-muted">O que os personais cobram dos próprios alunos neste mês, a partir dos resumos que eles enviam. Não é a mensalidade da plataforma.</p>
        <dl className="admin-grid" aria-label="Cobranças dos personais aos alunos no mês">
          <div className="admin-figure"><dt>Previsto no mês</dt><dd><Money cents={studentCharges ? studentCharges.expectedCents : null} /></dd></div>
          <div className="admin-figure"><dt>Recebido</dt><dd><Money cents={studentCharges ? studentCharges.receivedCents : null} /></dd></div>
          <div className="admin-figure"><dt>Em atraso</dt><dd><Money cents={studentCharges ? studentCharges.overdueCents : null} /></dd></div>
        </dl>
        <h3>Atalhos úteis</h3>
        <ul>
          <li><a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Console do Firebase</a></li>
          <li><a href="https://alexmiguel011014-stack.github.io/Personal_app_android/" target="_blank" rel="noreferrer">Site publicado</a></li>
        </ul>
        <p className="admin-muted">Administradores cadastrados: {data.admins}</p>
      </details>
    </>}
  </main>;
}
