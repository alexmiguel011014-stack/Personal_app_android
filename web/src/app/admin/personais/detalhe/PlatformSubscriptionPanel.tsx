"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  assignPlatformSubscription,
  extendPlatformTrial,
  extendPlatformInvoiceDueDate,
  issuePlatformInvoice,
  loadPlatformBillingUsage,
  loadPlatformSubscription,
  recordPlatformInvoicePayment,
  type PlatformInvoice,
  type PlatformBillingUsage,
  type PlatformSubscription,
  type PlatformSubscriptionMode,
} from "../../../../data/platformSubscriptions";
import { loadPlatformPlanTemplates, loadPlatformTrialDefaults } from "../../../../data/platformPlans";
import { getFirebase } from "../../../../data/firebase";
import type { PlatformBillingPlanTemplate, PlatformBillingTerms } from "../../../../domain/platformBilling";
import { formatDate, localDate } from "../../../../domain/dates";
import { formatCents, parseAmountCents } from "../../../../domain/payments";
import { resolvePlatformInviteAsAdmin } from "../../../../data/platformInvites";
import { DateTime, Empty, Money } from "../../AdminPrimitives";
import { FocusNotice } from "../../../_shared/FocusNotice";

type TermsDraft = {
  monthlyBase: string;
  includedStudentSeats: string;
  extraStudentMonthly: string;
  maxActiveInviteCodes: string;
  trialMaxStudentSeats: string;
  trialDurationDays: string;
};

const EMPTY_TERMS: TermsDraft = {
  monthlyBase: "",
  includedStudentSeats: "",
  extraStudentMonthly: "",
  maxActiveInviteCodes: "",
  trialMaxStudentSeats: "",
  trialDurationDays: "",
};

function termsDraft(terms: PlatformBillingTerms): TermsDraft {
  return {
    monthlyBase: formatCents(terms.monthlyBaseCents).replace(/^R\$\s*/, ""),
    includedStudentSeats: String(terms.includedStudentSeats),
    extraStudentMonthly: formatCents(terms.extraStudentMonthlyCents).replace(/^R\$\s*/, ""),
    maxActiveInviteCodes: String(terms.maxActiveInviteCodes),
    trialMaxStudentSeats: String(terms.trialMaxStudentSeats),
    trialDurationDays: String(terms.trialDurationDays),
  };
}

function integerValue(text: string, label: string): number {
  if (!/^\d+$/.test(text.trim())) throw new Error(`${label}: informe um número inteiro igual ou maior que zero.`);
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new Error(`${label}: o número informado é grande demais.`);
  return value;
}

function centsValue(text: string, label: string): number {
  const value = parseAmountCents(text);
  if (value === null) throw new Error(`${label}: informe um valor válido em reais, como 150,00.`);
  return value;
}

function parsedTerms(draft: TermsDraft): PlatformBillingTerms {
  return {
    monthlyBaseCents: centsValue(draft.monthlyBase, "Mensalidade base"),
    includedStudentSeats: integerValue(draft.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: centsValue(draft.extraStudentMonthly, "Adicional por aluno"),
    maxActiveInviteCodes: integerValue(draft.maxActiveInviteCodes, "Códigos ativos máximos"),
    trialMaxStudentSeats: integerValue(draft.trialMaxStudentSeats, "Alunos no teste"),
    trialDurationDays: integerValue(draft.trialDurationDays, "Duração do teste"),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s*\[\d{3}\]$/, "") : "Não foi possível concluir a operação. Tente novamente.";
}

function modeLabel(subscription: PlatformSubscription | null): string {
  if (!subscription) return "Sem assinatura da plataforma";
  return subscription.mode === "trial"
    ? subscription.chargeDuringTrial ? "Teste com cobrança configurada" : "Teste grátis"
    : "Plano pago";
}

function invoiceStatusLabel(invoice: PlatformInvoice | null): string {
  if (!invoice) return "Sem fatura emitida";
  return invoice.status === "paid" ? "Paga" : "Em aberto";
}

export function PlatformSubscriptionPanel({
  trainerUid,
  adminUid,
  accessStatus,
  billingStatus,
  billingUntil,
  canManage,
}: {
  trainerUid: string;
  adminUid: string;
  linkedStudentSeats: number | null;
  accessStatus: "active" | "suspended";
  billingStatus: "pending" | "trial" | "current" | "blocked" | null;
  billingUntil: number | null;
  canManage: boolean;
}) {
  const [templates, setTemplates] = useState<PlatformBillingPlanTemplate[]>([]);
  const [subscription, setSubscription] = useState<PlatformSubscription | null>(null);
  const [invoice, setInvoice] = useState<PlatformInvoice | null>(null);
  const [billingUsage, setBillingUsage] = useState<PlatformBillingUsage | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteResolutionReason, setInviteResolutionReason] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [terms, setTerms] = useState<TermsDraft>(EMPTY_TERMS);
  const [mode, setMode] = useState<PlatformSubscriptionMode>("trial");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [chargeDuringTrial, setChargeDuringTrial] = useState(false);
  const [assignmentReason, setAssignmentReason] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceReason, setInvoiceReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [extensionDays, setExtensionDays] = useState("");
  const [extensionReason, setExtensionReason] = useState("");
  const [trialExtensionDays, setTrialExtensionDays] = useState("");
  const [trialExtensionReason, setTrialExtensionReason] = useState("");
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const firebase = getFirebase();
    void Promise.all([
      loadPlatformPlanTemplates(firebase.db),
      loadPlatformTrialDefaults(firebase.db),
      loadPlatformSubscription(firebase.db, trainerUid),
    ]).then(async ([loadedTemplates, defaults, view]) => {
      if (cancelled) return;
      const [usageResult] = await Promise.allSettled([loadPlatformBillingUsage(firebase.functions, trainerUid)]);
      const usage = usageResult?.status === "fulfilled" ? usageResult.value : null;
      const usageFailure = usageResult?.status === "rejected" ? errorText(usageResult.reason) : null;
      if (cancelled) return;
      setTemplates(loadedTemplates);
      setSubscription(view.subscription);
      setInvoice(view.currentInvoice);
      setBillingUsage(usage);
      setUsageError(usageFailure);
      const selectedTemplateId = view.subscription?.terms.templateId ?? defaults?.defaultPlanTemplateId ?? "";
      setTemplateId(selectedTemplateId);
      const selectedTemplate = loadedTemplates.find((item) => item.id === selectedTemplateId);
      setTerms(view.subscription
        ? termsDraft(view.subscription.terms)
        : selectedTemplate ? termsDraft(selectedTemplate) : EMPTY_TERMS);
      setMode(view.subscription?.mode ?? "trial");
      setEffectiveDate(localDate(view.subscription?.effectiveAt ?? Date.now()));
      setChargeDuringTrial(view.subscription?.chargeDuringTrial ?? false);
      setError(null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) {
        setToday(localDate(Date.now()));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [trainerUid, reloadVersion]);

  function selectTemplate(nextId: string) {
    setTemplateId(nextId);
    const selected = templates.find((item) => item.id === nextId);
    if (selected) setTerms(termsDraft(selected));
    setError(null);
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    if (!templateId) { setError("Escolha um modelo antes de atribuir os termos."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await assignPlatformSubscription(getFirebase().db, adminUid, trainerUid, {
        templateId,
        terms: parsedTerms(terms),
        mode,
        chargeDuringTrial,
        effectiveAt: new Date(`${effectiveDate}T00:00:00`).getTime(),
        reason: assignmentReason,
      });
      setSubscription(saved);
      setAssignmentReason("");
      setNotice(`Termos da plataforma salvos na versão ${saved.terms.snapshotVersion}.`);
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !mayInvoice || !subscription) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await issuePlatformInvoice(getFirebase().functions, trainerUid, invoiceDueDate, invoiceReason);
      setInvoice(saved);
      setInvoiceDueDate(""); setInvoiceReason("");
      setNotice(`Fatura ${saved.period} emitida por ${formatCents(saved.amountCents)} para ${saved.billableStudentSeats} vagas (${saved.linkedStudentSeats} vinculados e ${saved.reservedInviteSeats} convites reservados).`);
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function markPaid() {
    if (!invoice || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await recordPlatformInvoicePayment(getFirebase().db, adminUid, trainerUid, invoice.id, paymentReference);
      setInvoice(saved); setPaymentReference("");
      setNotice("Pagamento registrado na fatura da plataforma.");
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function extendDueDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoice || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const days = integerValue(extensionDays, "Dias para prorrogar");
      const saved = await extendPlatformInvoiceDueDate(getFirebase().db, adminUid, trainerUid, invoice.id, days, extensionReason);
      setInvoice(saved); setExtensionDays(""); setExtensionReason("");
      setNotice(`Vencimento prorrogado para ${formatDate(saved.dueDate)}. Essa prorrogação não altera o estado de acesso da conta.`);
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function extendTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscription || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const days = integerValue(trialExtensionDays, "Dias para prorrogar o teste");
      const saved = await extendPlatformTrial(getFirebase().db, adminUid, trainerUid, days, trialExtensionReason);
      setSubscription(saved); setTrialExtensionDays(""); setTrialExtensionReason("");
      setNotice("Prazo do teste prorrogado e registrado na auditoria. Se o acesso já estava bloqueado, a prorrogação não o reativa.");
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function resolveInvite(code: string) {
    const normalizedCode = code.trim().toUpperCase();
    if (busy || !normalizedCode || !inviteResolutionReason.trim()) return;
    if (!window.confirm(`Resolver o convite ${normalizedCode}? O código deixará de funcionar e a ação ficará registrada.`)) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await resolvePlatformInviteAsAdmin(getFirebase().db, adminUid, trainerUid, normalizedCode, inviteResolutionReason);
      setInviteCode("");
      setInviteResolutionReason("");
      setNotice(`Convite ${normalizedCode} resolvido e registrado na auditoria.`);
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  const mayInvoice = subscription !== null && (subscription.mode === "paid" || subscription.chargeDuringTrial);

  return <section className="panel">
    <h2>Assinatura e cobrança da plataforma</h2>
    {error && <FocusNotice role="alert">{error}</FocusNotice>}
    {notice && <FocusNotice>{notice}</FocusNotice>}
    {loading ? <p className="loading" role="status">Carregando termos e fatura…</p> : <>
      <div className="admin-grid">
        <dl className="admin-figure"><dt>Vagas faturáveis agora</dt><dd>{billingUsage?.billableStudentSeats ?? "Ainda sem dados"}</dd></dl>
        <dl className="admin-figure"><dt>Status da assinatura</dt><dd>{modeLabel(subscription)}</dd></dl>
        <dl className="admin-figure"><dt>Fatura atual</dt><dd>{invoiceStatusLabel(invoice)}</dd></dl>
        <dl className="admin-figure"><dt>Acesso da conta</dt><dd>{accessStatus === "active" ? "Ativo" : "Suspenso"}</dd></dl>
        <dl className="admin-figure"><dt>Acesso por cobrança</dt><dd>{billingStatus === "pending" ? "Pendente de termos" : billingStatus === "blocked" ? "Bloqueado" : billingStatus === "trial" ? "Teste" : billingStatus === "current" ? "Liberado" : "Conta antiga sem regra aplicada"}</dd></dl>
      </div>
      {usageError && <p className="admin-muted" role="status">{usageError}</p>}
      {subscription && <section>
        <h3>Uso de alunos e convites</h3>
        <dl>
          <div><dt>Vinculados · convites reservados · total faturável</dt><dd>{billingUsage ? `${billingUsage.linkedStudentSeats} · ${billingUsage.reservedInviteSeats} · ${billingUsage.billableStudentSeats}` : "—"}</dd></div>
          <div><dt>Vagas incluídas restantes</dt><dd>{billingUsage ? Math.max(0, billingUsage.includedStudentSeats - billingUsage.billableStudentSeats) : "—"}</dd></div>
          <div><dt>Códigos ativos · máximo configurado</dt><dd>{billingUsage ? `${billingUsage.reservedInviteSeats} · ${billingUsage.maxActiveInviteCodes}` : `— · ${subscription.terms.maxActiveInviteCodes}`}</dd></div>
          {subscription.mode === "trial" && <div><dt>Vagas usadas no teste · limite</dt><dd>{billingUsage ? `${billingUsage.billableStudentSeats} / ${subscription.terms.trialMaxStudentSeats}` : `— / ${subscription.terms.trialMaxStudentSeats}`}</dd></div>}
          {billingUsage && <div><dt>Mensalidade estimada pelas vagas faturáveis</dt><dd><Money cents={billingUsage.amountCents} /></dd></div>}
        </dl>
      </section>}
      {canManage && <section>
        <h3>Resolver convite informado pelo personal</h3>
        <p>Para proteger os dados do aluno, esta tela não lista documentos de convite. Convites sem vencimento seguem ativos até serem cancelados; peça o código ao personal para resolvê-lo.</p>
        <form onSubmit={(event) => { event.preventDefault(); void resolveInvite(inviteCode); }}>
          <p>
            <label>Código de 8 caracteres<input required minLength={8} maxLength={8} pattern="[A-Fa-f0-9]{8}" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} /></label>
            <label>Motivo para resolver<input required maxLength={200} value={inviteResolutionReason} onChange={(event) => setInviteResolutionReason(event.target.value)} /></label>
          </p>
          <button type="submit" aria-disabled={busy || !inviteCode.trim() || !inviteResolutionReason.trim()}>{busy ? "Resolvendo…" : "Resolver código"}</button>
        </form>
      </section>}
      <p className="admin-muted">A cobrança de plataforma é independente das mensalidades dos alunos. A regra de cobrança pode bloquear o personal; suspensão manual continua separada.{billingUntil !== null && <> Acesso por cobrança até <DateTime at={billingUntil} />.</>}</p>

      {subscription && <section>
        <h3>Termos atuais · versão {subscription.terms.snapshotVersion}</h3>
        <dl>
          <div><dt>Modelo de origem</dt><dd>{templates.find((item) => item.id === subscription.terms.templateId)?.name ?? subscription.terms.templateId} · versão {subscription.terms.templateVersion}</dd></div>
          <div><dt>Vigência</dt><dd><DateTime at={subscription.effectiveAt} /></dd></div>
          <div><dt>Mensalidade base · alunos incluídos</dt><dd><Money cents={subscription.terms.monthlyBaseCents} /> · {subscription.terms.includedStudentSeats}</dd></div>
          <div><dt>Adicional mensal por aluno · convites ativos máximos</dt><dd><Money cents={subscription.terms.extraStudentMonthlyCents} /> · {subscription.terms.maxActiveInviteCodes}</dd></div>
          <div><dt>Teste grátis · limite de alunos · duração</dt><dd>{subscription.terms.trialMaxStudentSeats} · {subscription.terms.trialDurationDays} dias</dd></div>
          {subscription.mode === "trial" && <div><dt>Período de teste</dt><dd><DateTime at={subscription.trialStartedAt} /> até <DateTime at={subscription.trialEndsAt} /></dd></div>}
        </dl>
        {canManage && subscription.mode === "trial" && <form onSubmit={(event) => void extendTrial(event)}>
          <h4>Prorrogar teste grátis</h4>
          <p>
            <label>Adicionar dias<input type="number" min="1" step="1" required value={trialExtensionDays} onChange={(event) => setTrialExtensionDays(event.target.value)} /></label>
            <label>Motivo<input required maxLength={200} value={trialExtensionReason} onChange={(event) => setTrialExtensionReason(event.target.value)} /></label>
          </p>
          <button type="submit" aria-disabled={busy}>{busy ? "Salvando…" : "Prorrogar teste"}</button>
        </form>}
      </section>}

      {invoice ? <section>
        <h3>Fatura atual · {invoice.period}</h3>
        <dl>
          <div><dt>Status</dt><dd>{invoiceStatusLabel(invoice)}</dd></div>
          <div><dt>Vencimento</dt><dd>{formatDate(invoice.dueDate)}</dd></div>
          <div><dt>Vinculados · convites reservados · total faturável</dt><dd>{invoice.linkedStudentSeats} · {invoice.reservedInviteSeats} · {invoice.billableStudentSeats}</dd></div>
          <div><dt>Vagas incluídas · excedentes</dt><dd>{invoice.includedStudentSeats} · {invoice.extraStudentSeats}</dd></div>
          <div><dt>Base · adicionais · total</dt><dd><Money cents={invoice.monthlyBaseCents} /> · <Money cents={invoice.extraAmountCents} /> · <strong><Money cents={invoice.amountCents} /></strong></dd></div>
          {invoice.status === "paid" && <div><dt>Pagamento registrado</dt><dd><DateTime at={invoice.paidAt} /> · ADM {invoice.paidBy}</dd></div>}
          {invoice.paymentReference && <div><dt>Referência informada</dt><dd>{invoice.paymentReference}</dd></div>}
        </dl>
        {canManage && invoice.status === "unpaid" && <>
          <div className="admin-toolbar">
            <label>Referência não sensível do pagamento (opcional)<input maxLength={120} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
            <button type="button" aria-disabled={busy} onClick={() => void markPaid()}>{busy ? "Salvando…" : "Registrar pagamento"}</button>
          </div>
          <form onSubmit={(event) => void extendDueDate(event)}>
            <h4>Prorrogar vencimento</h4>
            <p>
              <label>Adicionar dias<input type="number" min="1" step="1" required value={extensionDays} onChange={(event) => setExtensionDays(event.target.value)} /></label>
              <label>Motivo da prorrogação<input required maxLength={200} value={extensionReason} onChange={(event) => setExtensionReason(event.target.value)} /></label>
            </p>
            <button type="submit" aria-disabled={busy}>{busy ? "Salvando…" : "Prorrogar vencimento"}</button>
          </form>
        </>}
      </section> : <section><h3>Fatura atual</h3><Empty>Nenhuma fatura foi emitida para este personal.</Empty></section>}

      {canManage && <>
        <form onSubmit={(event) => void saveAssignment(event)}>
          <h3>{subscription ? "Ajustar termos do personal" : "Atribuir plano ao personal"}</h3>
          {templates.length === 0 ? <p role="alert">Cadastre um modelo em Planos e padrões antes de atribuir termos.</p> : <>
            <p><label>Modelo de origem
              <select required value={templateId} onChange={(event) => selectTemplate(event.target.value)}>
                <option value="">Escolha um modelo</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · versão {template.version}</option>)}
              </select>
            </label></p>
            <p><label>Modalidade
              <select value={mode} onChange={(event) => setMode(event.target.value as PlatformSubscriptionMode)}>
                <option value="trial">Teste grátis</option>
                <option value="paid">Plano pago</option>
              </select>
            </label></p>
            <p><label>Data de vigência<input type="date" required max={today || undefined} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label></p>
            <p>
              <label>Mensalidade base (R$)<input required inputMode="decimal" placeholder="0,00" value={terms.monthlyBase} onChange={(event) => setTerms((current) => ({ ...current, monthlyBase: event.target.value }))} /></label>
              <label>Alunos incluídos<input type="number" min="0" step="1" required value={terms.includedStudentSeats} onChange={(event) => setTerms((current) => ({ ...current, includedStudentSeats: event.target.value }))} /></label>
              <label>Adicional mensal por aluno excedente (R$)<input required inputMode="decimal" placeholder="0,00" value={terms.extraStudentMonthly} onChange={(event) => setTerms((current) => ({ ...current, extraStudentMonthly: event.target.value }))} /></label>
            </p>
            <p>
              <label>Máximo de convites ativos ao mesmo tempo<input type="number" min="0" step="1" required value={terms.maxActiveInviteCodes} onChange={(event) => setTerms((current) => ({ ...current, maxActiveInviteCodes: event.target.value }))} /></label>
              <label>Máximo de alunos durante o teste<input type="number" min="0" step="1" required value={terms.trialMaxStudentSeats} onChange={(event) => setTerms((current) => ({ ...current, trialMaxStudentSeats: event.target.value }))} /></label>
              <label>Duração do teste (dias)<input type="number" min="0" step="1" required value={terms.trialDurationDays} onChange={(event) => setTerms((current) => ({ ...current, trialDurationDays: event.target.value }))} /></label>
            </p>
            {mode === "trial" && <label><input type="checkbox" checked={chargeDuringTrial} onChange={(event) => setChargeDuringTrial(event.target.checked)} /> Cobrar a mensalidade durante o teste grátis</label>}
            <p><label>Motivo da atribuição ou ajuste<input required maxLength={200} value={assignmentReason} onChange={(event) => setAssignmentReason(event.target.value)} /></label></p>
            <button type="submit" aria-disabled={busy || loading || !templateId}>{busy ? "Salvando…" : "Salvar termos e registrar auditoria"}</button>
          </>}
        </form>

        <form onSubmit={(event) => void createInvoice(event)}>
          <h3>Emitir fatura manual</h3>
          <p>A cobrança usa uma contagem atualizada de alunos vinculados e convites ativos não utilizados, sem carregar dados do aluno para a tela. Será criada no máximo uma fatura por personal e competência.</p>
          {subscription?.mode === "trial" && !subscription.chargeDuringTrial && <p className="admin-muted">O teste grátis não gera cobrança enquanto a opção de cobrança durante o teste estiver desativada.</p>}
          <p>
            <label>Vencimento<input type="date" required min={today || undefined} value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} /></label>
            <label>Motivo / observação da emissão<input required maxLength={200} value={invoiceReason} onChange={(event) => setInvoiceReason(event.target.value)} /></label>
          </p>
          <button type="submit" aria-disabled={busy || !mayInvoice || !subscription}>{busy ? "Emitindo…" : "Emitir fatura"}</button>
        </form>
      </>}
    </>}
  </section>;
}
