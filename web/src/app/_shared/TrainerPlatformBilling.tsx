"use client";

import { useEffect, useState } from "react";
import { formatDate } from "../../domain/dates";
import { formatCents } from "../../domain/payments";
import { getFirebase } from "../../data/firebase";
import { loadPlatformSubscription, loadTrainerPlatformInvoices, type PlatformInvoice, type PlatformSubscription } from "../../data/platformSubscriptions";

export function TrainerPlatformBilling({ uid }: { uid: string }) {
  const [subscription, setSubscription] = useState<PlatformSubscription | null>(null);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const db = getFirebase().db;
    void Promise.all([loadPlatformSubscription(db, uid), loadTrainerPlatformInvoices(db, uid)])
      .then(([view, history]) => {
        if (cancelled) return;
        setSubscription(view.subscription);
        setInvoices(history);
      })
      .catch(() => { if (!cancelled) setError("Não foi possível carregar os termos e as faturas da plataforma."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  return <section className="panel" aria-labelledby="trainer-platform-billing-title">
    <h2 id="trainer-platform-billing-title">Plano e faturas da plataforma</h2>
    <p>Consulta disponível mesmo quando o acesso do personal está bloqueado. Para alterações ou regularização, fale com o administrador.</p>
    {loading ? <p role="status">Carregando cobrança…</p> : error ? <p role="alert">{error}</p> : !subscription ? <p>Nenhum plano ou teste foi atribuído ainda.</p> : <>
      <dl>
        <div><dt>Modalidade e versão</dt><dd>{subscription.mode === "trial" ? "Teste" : "Plano pago"} · termos v{subscription.terms.snapshotVersion}</dd></div>
        <div><dt>Mensalidade base · incluídos · adicional por aluno</dt><dd>{formatCents(subscription.terms.monthlyBaseCents)} · {subscription.terms.includedStudentSeats} · {formatCents(subscription.terms.extraStudentMonthlyCents)}</dd></div>
        <div><dt>Códigos de convite ativos máximos</dt><dd>{subscription.terms.maxActiveInviteCodes}</dd></div>
        {subscription.mode === "trial" && subscription.trialEndsAt !== null && <div><dt>Fim do teste</dt><dd>{new Date(subscription.trialEndsAt).toLocaleDateString("pt-BR")}</dd></div>}
      </dl>
      {invoices.length === 0 ? <p>Nenhuma fatura emitida.</p> : <ul className="admin-list">
        {invoices.map((invoice) => <li key={invoice.id}>
          <span><strong>{invoice.period} · {formatCents(invoice.amountCents)}</strong><br /><small>{invoice.billableStudentSeats} vagas ({invoice.linkedStudentSeats} alunos + {invoice.reservedInviteSeats} convites) · vencimento {formatDate(invoice.dueDate)}</small></span>
          <small>{invoice.status === "paid" ? `Paga em ${new Date(invoice.paidAt ?? 0).toLocaleDateString("pt-BR")}` : "Em aberto"}</small>
        </li>)}
      </ul>}
    </>}
  </section>;
}
