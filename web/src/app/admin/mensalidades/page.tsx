"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getFirebase } from "../../../data/firebase";
import { buildMensalidadeRows, loadMensalidadeData, mensalidadeCounts, type MensalidadeData, type MensalidadeRow } from "../../../data/mensalidades";
import { formatDate, localDate } from "../../../domain/dates";
import { mensalidadeLabel, mensalidadeRank, mensalidadeStateName, type MensalidadeState } from "../../../domain/mensalidades";
import { useSession } from "../../SessionProvider";
import { FocusNotice } from "../../_shared/FocusNotice";
import { Empty, LoadingOrError, Money, PageHeading } from "../AdminPrimitives";
import { AssignPlanDialog } from "./AssignPlanDialog";
import { MarkPaidDialog } from "./MarkPaidDialog";

type Filter = "todos" | MensalidadeState;
type SortKey = "urgencia" | "nome" | "vencimento";

// Most urgent first — the order the summary figures and the default list follow.
const FIGURES: readonly MensalidadeState[] = ["atrasado", "vence_breve", "aguardando", "teste", "em_dia", "sem_plano"];

function rowName(row: MensalidadeRow): string {
  return row.trainer.name || row.trainer.email || "Sem nome";
}

export default function MensalidadesPage() {
  const { session } = useSession();
  const adminUid = session.status === "signedIn" ? session.uid : "";
  const [data, setData] = useState<MensalidadeData | null>(null);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<Filter>("todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("urgencia");
  const [payTarget, setPayTarget] = useState<MensalidadeRow | null>(null);
  const [assignTarget, setAssignTarget] = useState<MensalidadeRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMensalidadeData(getFirebase().db).then((loaded) => {
      if (cancelled) return;
      setData(loaded);
      setNow(Date.now());
      setError(null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as mensalidades.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [version]);

  function reload(message: string) {
    setNotice(message);
    setPayTarget(null);
    setAssignTarget(null);
    setLoading(true);
    setVersion((value) => value + 1);
  }

  const rows = useMemo(() => (data ? buildMensalidadeRows(data, now) : []), [data, now]);
  const counts = useMemo(() => mensalidadeCounts(rows), [rows]);
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows
      .filter((row) => (filter === "todos" || row.mensalidade.state === filter)
        && (!term || rowName(row).toLocaleLowerCase("pt-BR").includes(term) || row.trainer.email.toLocaleLowerCase("pt-BR").includes(term)))
      .sort((a, b) => {
        const byName = rowName(a).localeCompare(rowName(b), "pt-BR");
        if (sort === "nome") return byName;
        const aDate = a.mensalidade.expiresOn ?? "9999-99-99";
        const bDate = b.mensalidade.expiresOn ?? "9999-99-99";
        if (sort === "vencimento") return aDate.localeCompare(bDate) || byName;
        return mensalidadeRank(a.mensalidade.state) - mensalidadeRank(b.mensalidade.state) || aDate.localeCompare(bDate) || byName;
      });
  }, [rows, filter, search, sort]);

  return <main>
    <PageHeading title="Mensalidades">Quem tem plano, quem pagou e quando cada acesso expira. É o que cada personal paga à plataforma.</PageHeading>
    {notice && <FocusNotice>{notice}</FocusNotice>}
    <LoadingOrError loading={loading} error={error} retry={() => { setLoading(true); setVersion((value) => value + 1); }} />
    {!loading && !error && data && <>
      {data.paymentsUnavailable && <p className="admin-muted" role="status">O histórico de pagamentos ainda não está disponível. Publique as regras mais recentes do Firestore para registrar e ver pagamentos.</p>}
      <div className="admin-grid admin-grid-filters" role="group" aria-label="Filtrar por situação">
        <button type="button" className="admin-figure admin-figure-button" aria-pressed={filter === "todos"} onClick={() => setFilter("todos")}>
          <span className="admin-figure-label">Todos</span><span className="admin-figure-value">{rows.length}</span>
        </button>
        {FIGURES.map((state) => <button key={state} type="button" className="admin-figure admin-figure-button" aria-pressed={filter === state} onClick={() => setFilter(filter === state ? "todos" : state)}>
          <span className="admin-figure-label">{mensalidadeStateName(state)}</span><span className="admin-figure-value">{counts[state]}</span>
        </button>)}
      </div>
      <div className="admin-toolbar">
        <label className="grow">Buscar por nome ou e-mail<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label>Ordenar por<select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="urgencia">Urgência</option>
          <option value="vencimento">Vencimento</option>
          <option value="nome">Nome</option>
        </select></label>
      </div>
      <p className="admin-muted">{visible.length} de {rows.length} personais</p>
      {rows.length === 0 ? <Empty>Nenhum personal cadastrado ainda.</Empty> : visible.length === 0 ? <Empty>Nenhum personal corresponde ao filtro.</Empty> : <table className="stack" aria-label="Mensalidades dos personais">
        <thead><tr><th scope="col">Personal</th><th scope="col">Plano</th><th scope="col">Situação</th><th scope="col">Expira em</th><th scope="col">Mensalidade</th><th scope="col">Último pagamento</th><th scope="col">Ações</th></tr></thead>
        <tbody>{visible.map((row) => {
          const { mensalidade } = row;
          return <tr key={row.trainer.id}>
            <th scope="row" data-label="Personal"><Link href={`/admin/personais/detalhe?id=${encodeURIComponent(row.trainer.id)}`}>{rowName(row)}</Link><br /><small>{row.trainer.email}</small></th>
            <td data-label="Plano"><div>{row.planName ? <>Plano cadastrado:<br /><strong>{row.planName}</strong></> : "Sem plano"}</div></td>
            <td data-label="Situação"><div>
              <span className="admin-status" data-state={mensalidade.state}>{mensalidadeStateName(mensalidade.state)}</span>
              {row.trainer.accessStatus === "suspended" && <> <span className="admin-status" data-state="suspended">Suspenso</span></>}
              {mensalidadeLabel(mensalidade) !== mensalidadeStateName(mensalidade.state) && <><br /><small>{mensalidadeLabel(mensalidade)}</small></>}
            </div></td>
            <td data-label="Expira em" className="admin-nowrap">{mensalidade.expiresOn ? formatDate(mensalidade.expiresOn) : "—"}</td>
            <td data-label="Mensalidade">{row.subscription ? <Money cents={row.subscription.terms.monthlyBaseCents} /> : "—"}</td>
            <td data-label="Último pagamento" className="admin-nowrap">{row.lastPayment ? formatDate(localDate(row.lastPayment.paidAt)) : "—"}</td>
            <td data-label="Ações"><div className="admin-actions">
              {row.subscription
                ? <button type="button" className="button-primary" onClick={() => { setNotice(null); setPayTarget(row); }}>Marcar como pago</button>
                : <button type="button" className="button-primary" onClick={() => { setNotice(null); setAssignTarget(row); }}>Cadastrar plano</button>}
              <Link className="button" href={`/admin/personais/detalhe?id=${encodeURIComponent(row.trainer.id)}`}>Detalhes</Link>
            </div></td>
          </tr>;
        })}</tbody>
      </table>}
    </>}

    {payTarget?.subscription && <MarkPaidDialog
      key={payTarget.trainer.id}
      adminUid={adminUid}
      target={{
        trainerUid: payTarget.trainer.id,
        trainerName: rowName(payTarget),
        planName: payTarget.planName ?? "",
        terms: payTarget.subscription.terms,
        billingStatus: payTarget.trainer.platformBillingStatus ?? null,
        billingUntil: payTarget.trainer.platformBillingUntil ?? null,
      }}
      onClose={() => setPayTarget(null)}
      onDone={(payment) => reload(`Pagamento registrado para ${rowName(payTarget)}. Acesso até ${formatDate(payment.paidThroughDate)}.`)}
    />}
    {assignTarget && data && <AssignPlanDialog
      key={assignTarget.trainer.id}
      adminUid={adminUid}
      trainerUid={assignTarget.trainer.id}
      trainerName={rowName(assignTarget)}
      templates={data.templates}
      onClose={() => setAssignTarget(null)}
      onDone={(subscription) => reload(subscription.mode === "trial"
        ? `Plano cadastrado para ${rowName(assignTarget)}. Teste grátis em andamento.`
        : `Plano cadastrado para ${rowName(assignTarget)}. O acesso começa depois do primeiro pagamento.`)}
    />}
  </main>;
}
