"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadActivity, loadTrainerStats, loadTrainers } from "../../../data/admin";
import { describeMensalidade } from "../../../data/mensalidades";
import { loadPlatformPlanTemplates } from "../../../data/platformPlans";
import { loadAllPlatformSubscriptions } from "../../../data/platformSubscriptions";
import { mensalidadeLabel, mensalidadeStateName } from "../../../domain/mensalidades";
import { getFirebase } from "../../../data/firebase";
import { trainersCsv, trainerRow, type TrainerRow } from "../../../domain/adminMetrics";
import { PageHeading, LoadingOrError, Money, DateTime, Empty } from "../AdminPrimitives";
import { browserTimeZone } from "../../_shared/browserTimeZone";
import { addDays, localDate, yearMonth } from "../../../domain/dates";

type SortKey = "name" | "email" | "accessStatus" | "usage" | "actions30d" | "activeDays30d" | "students" | "lastSeenAt" | "activePlans" | "averageTicketCents" | "expectedCents" | "receivedCents" | "collectionRate" | "statsUpdatedAt";
const SORT_LABELS: [SortKey, string][] = [["name", "Nome"], ["email", "E-mail"], ["accessStatus", "Status"], ["usage", "Uso"], ["actions30d", "Ações (30d)"], ["activeDays30d", "Dias ativos (30d)"], ["students", "Alunos"], ["lastSeenAt", "Última visita"], ["activePlans", "Planos"], ["averageTicketCents", "Ticket médio"], ["expectedCents", "Previsto"], ["receivedCents", "Recebido"], ["collectionRate", "Recebimento"], ["statsUpdatedAt", "Atualização"]];

export default function TrainersDirectoryPage() {
  const [rows, setRows] = useState<TrainerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("todos");
  const [usage, setUsage] = useState("todos");
  const [sort, setSort] = useState<SortKey>("name");
  const [descending, setDescending] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebase().db;
        const [trainers, stats, subscriptions, templates] = await Promise.all([
          loadTrainers(db),
          loadTrainerStats(db),
          loadAllPlatformSubscriptions(db).catch(() => new Map()),
          loadPlatformPlanTemplates(db).catch(() => []),
        ]);
        const now = Date.now();
        const today = localDate(now, browserTimeZone());
        const months = [yearMonth(today), yearMonth(addDays(today, -31))];
        const activities = (await Promise.all(trainers.map((trainer) => loadActivity(db, trainer.id, months)))).flat();
        const result = trainers.map((trainer) => {
          const { planName, mensalidade } = describeMensalidade(trainer, subscriptions.get(trainer.id) ?? null, templates, now);
          return trainerRow(trainer, stats.find((item) => item.trainerId === trainer.id) ?? null, activities.filter((item) => item.trainerId === trainer.id), now, browserTimeZone(), { planName, state: mensalidade.state, label: mensalidadeLabel(mensalidade) });
        });
        if (!cancelled) { setRows(result); setError(null); }
      } catch { if (!cancelled) setError("Não foi possível carregar o diretório de personais."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [version]);

  const visible = useMemo(() => rows.filter((row) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return (!term || row.name.toLocaleLowerCase("pt-BR").includes(term) || row.email.toLocaleLowerCase("pt-BR").includes(term))
      && (status === "todos" || row.accessStatus === status) && (usage === "todos" || row.usage === usage);
  }).sort((a, b) => {
    const value = (row: TrainerRow): string | number | null => {
      if (sort === "students") return row.stats?.students.linked ?? null;
      if (sort === "expectedCents") return row.stats?.billing.expectedCents ?? null;
      if (sort === "receivedCents") return row.stats?.billing.receivedCents ?? null;
      return row[sort];
    };
    const av = value(a); const bv = value(b);
    const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "pt-BR") : Number(av ?? -1) - Number(bv ?? -1);
    return descending ? -cmp : cmp;
  }), [rows, search, status, usage, sort, descending]);

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", trainersCsv(visible)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "personais.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <main>
    <PageHeading title="Personais">Diretório de contas, atividade e indicadores agregados.</PageHeading>
    <div className="page-actions"><Link className="button button-primary" href="/admin/personais/novo">Cadastrar personal</Link><button type="button" onClick={downloadCsv} disabled={loading || rows.length === 0}>Baixar CSV</button></div>
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((n) => n + 1); }} />
    {!loading && !error && <>
      <div className="admin-toolbar">
        <label className="grow">Buscar por nome ou e-mail<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos</option><option value="active">Ativo</option><option value="suspended">Suspenso</option></select></label>
        <label>Uso<select value={usage} onChange={(event) => setUsage(event.target.value)}><option value="todos">Todos</option><option>Ativo</option><option>Quieto</option><option>Sumido</option><option>Nunca entrou</option></select></label>
        <label>Ordenar por<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>{SORT_LABELS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button type="button" aria-label={`Ordenação ${descending ? "decrescente" : "crescente"}`} onClick={() => setDescending((value) => !value)}>{descending ? "Mais alto primeiro" : "Mais baixo primeiro"}</button>
      </div>
      <p className="admin-muted">{visible.length} de {rows.length} personais</p>
      {visible.length === 0 ? <Empty>Nenhum personal corresponde aos filtros.</Empty> : <div className="admin-cards">{visible.map((row) => <article key={row.id} className="admin-card">
        <h2><Link className="admin-card-link" href={`/admin/personais/detalhe?id=${encodeURIComponent(row.id)}`}>{row.name || "Sem nome"}</Link></h2>
        <p>{row.email || "Sem e-mail cadastrado"}</p>
        <div className="admin-actions"><span className="admin-status" data-state={row.accessStatus}>{row.accessStatus === "active" ? "Ativo" : "Suspenso"}</span><span className="admin-status">{row.usage}</span></div>
        {row.billing && <p><span className="admin-status" data-state={row.billing.state}>{mensalidadeStateName(row.billing.state)}</span> {row.billing.planName ? `Plano ${row.billing.planName}` : "Sem plano"}{row.billing.label ? ` · ${row.billing.label}` : ""}</p>}
        <dl><div><dt>Ações · dias ativos (30d)</dt><dd>{row.actions30d} · {row.activeDays30d}</dd></div><div><dt>Alunos · planos ativos</dt><dd>{row.stats?.students.linked ?? "Ainda sem dados"} · {row.stats ? row.activePlans : "Ainda sem dados"}</dd></div><div><dt>Ticket médio · recebimento</dt><dd><Money cents={row.averageTicketCents === null ? null : Math.round(row.averageTicketCents)} /> · {row.collectionRate === null ? "Ainda sem dados" : `${Math.round(row.collectionRate * 100)}%`}</dd></div><div><dt>Previsto · recebido</dt><dd><Money cents={row.stats?.billing.expectedCents ?? null} /> · <Money cents={row.stats?.billing.receivedCents ?? null} /></dd></div><div><dt>Última visita · resumo</dt><dd><DateTime at={row.lastSeenAt} /> · <DateTime at={row.statsUpdatedAt || null} /></dd></div></dl>
        {row.stale && <p className="attention">Resumo sem atualização há mais de 14 dias</p>}
      </article>)}</div>}
    </>}
  </main>;
}
