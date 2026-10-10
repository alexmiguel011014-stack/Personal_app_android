"use client";

import { useEffect, useState } from "react";
import { formatDate, localDate } from "../../domain/dates";
import { mensalidadeLabel, mensalidadeOf, mensalidadeStateName } from "../../domain/mensalidades";
import { formatCents } from "../../domain/payments";
import { getFirebase } from "../../data/firebase";
import { loadPlatformSubscription, loadTrainerPlatformInvoices, loadTrainerPlatformPayments, type PlatformInvoice, type PlatformPayment, type PlatformSubscription } from "../../data/platformSubscriptions";
import { useSession } from "../SessionProvider";

/** GOALS.md §35 — the trainer's own plan, when it expires and what was recorded as paid. Read-only; it stays reachable while the account is locked. */
export function TrainerPlatformBilling({ uid }: { uid: string }) {
  const { session } = useSession();
  const profile = session.status === "signedIn" ? session.profile : null;
  const [subscription, setSubscription] = useState<PlatformSubscription | null>(null);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const db = getFirebase().db;
    void Promise.all([
      loadPlatformSubscription(db, uid),
      loadTrainerPlatformPayments(db, uid).catch(() => [] as PlatformPayment[]),
      loadTrainerPlatformInvoices(db, uid).catch(() => [] as PlatformInvoice[]),
    ])
      .then(([view, paid, history]) => {
        if (cancelled) return;
        setSubscription(view.subscription);
        setPayments(paid.filter((payment) => payment.voidedAt === null));
        setInvoices(history);
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar o plano e os pagamentos da plataforma."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  const mensalidade = mensalidadeOf({
    hasSubscription: subscription !== null,
    billingStatus: profile?.platformBillingStatus ?? null,
    billingUntil: profile?.platformBillingUntil ?? null,
  }, now);

  return <section className="panel" aria-labelledby="trainer-platform-billing-title">
    <h2 id="trainer-platform-billing-title">Plano e mensalidade</h2>
    <p>Consulta disponível mesmo quando o acesso está bloqueado. Para alterações ou para regularizar, fale com o administrador.</p>
    {loading ? <p role="status">Carregando plano…</p> : error ? <p role="alert">{error}</p> : !subscription ? <p>Nenhum plano foi cadastrado ainda.</p> : <>
      <dl>
        <div><dt>Plano</dt><dd>{subscription.terms.planName ?? "Plano"} · termos v{subscription.terms.snapshotVersion}</dd></div>
        <div><dt>Situação</dt><dd>{mensalidadeStateName(mensalidade.state)} · {mensalidadeLabel(mensalidade)}</dd></div>
        {mensalidade.expiresOn && <div><dt>Expira em</dt><dd>{formatDate(mensalidade.expiresOn)}</dd></div>}
        <div><dt>Mensalidade · alunos incluídos · adicional por aluno excedente</dt><dd>{formatCents(subscription.terms.monthlyBaseCents)} · {subscription.terms.includedStudentSeats} · {formatCents(subscription.terms.extraStudentMonthlyCents)}</dd></div>
        <div><dt>Códigos de convite ativos ao mesmo tempo</dt><dd>máximo de {subscription.terms.maxActiveInviteCodes}</dd></div>
      </dl>
      <h3>Pagamentos registrados</h3>
      {payments.length === 0 ? <p>Nenhum pagamento registrado ainda.</p> : <ul className="admin-list">
        {payments.map((payment) => <li key={payment.id}>
          <span><strong>{formatCents(payment.amountCents)} · acesso até {formatDate(payment.paidThroughDate)}</strong></span>
          <small>Registrado em {formatDate(localDate(payment.paidAt))}</small>
        </li>)}
      </ul>}
      {invoices.length > 0 && <>
        <h3>Faturas anteriores</h3>
        <ul className="admin-list">
          {invoices.map((invoice) => <li key={invoice.id}>
            <span><strong>{invoice.period} · {formatCents(invoice.amountCents)}</strong><br /><small>vencimento {formatDate(invoice.dueDate)}</small></span>
            <small>{invoice.status === "paid" ? `Paga em ${new Date(invoice.paidAt ?? 0).toLocaleDateString("pt-BR")}` : "Em aberto"}</small>
          </li>)}
        </ul>
      </>}
    </>}
  </section>;
}
