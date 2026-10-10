"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  assignPlatformSubscription,
  extendPlatformTrial,
  loadPlatformSubscription,
  loadTrainerBilling,
  loadTrainerPlatformPayments,
  voidPlatformPayment,
  type PlatformInvoice,
  type PlatformPayment,
  type PlatformSubscription,
} from "../../../../data/platformSubscriptions";
import { countLinkedStudents } from "../../../../data/admin";
import { loadPlatformPlanTemplates } from "../../../../data/platformPlans";
import { getFirebase } from "../../../../data/firebase";
import { effectivePlatformMonthlyAmountCents, type PlatformBillingPlanTemplate, type PlatformBillingTerms } from "../../../../domain/platformBilling";
import { formatDate, localDate } from "../../../../domain/dates";
import { mensalidadeLabel, mensalidadeOf, mensalidadeStateName, type BillingStatus } from "../../../../domain/mensalidades";
import { formatCents, parseAmountCents } from "../../../../domain/payments";
import { resolvePlatformInviteAsAdmin } from "../../../../data/platformInvites";
import { DateTime, Empty, Money } from "../../AdminPrimitives";
import { AssignPlanDialog, assignmentConsequence } from "../../mensalidades/AssignPlanDialog";
import { MarkPaidDialog } from "../../mensalidades/MarkPaidDialog";
import { ConfirmDialog } from "../../../_shared/ConfirmDialog";
import { FocusNotice } from "../../../_shared/FocusNotice";

type TermsDraft = {
  monthlyBase: string;
  includedStudentSeats: string;
  extraStudentMonthly: string;
  maxActiveInviteCodes: string;
  trialDurationDays: string;
};

const EMPTY_TERMS: TermsDraft = {
  monthlyBase: "",
  includedStudentSeats: "",
  extraStudentMonthly: "",
  maxActiveInviteCodes: "",
  trialDurationDays: "",
};

function termsDraft(terms: PlatformBillingTerms): TermsDraft {
  return {
    monthlyBase: formatCents(terms.monthlyBaseCents).replace(/^R\$\s*/, ""),
    includedStudentSeats: String(terms.includedStudentSeats),
    extraStudentMonthly: formatCents(terms.extraStudentMonthlyCents).replace(/^R\$\s*/, ""),
    maxActiveInviteCodes: String(terms.maxActiveInviteCodes),
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
    monthlyBaseCents: centsValue(draft.monthlyBase, "Mensalidade"),
    includedStudentSeats: integerValue(draft.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: centsValue(draft.extraStudentMonthly, "Adicional por aluno"),
    maxActiveInviteCodes: integerValue(draft.maxActiveInviteCodes, "Códigos ativos máximos"),
    trialDurationDays: integerValue(draft.trialDurationDays, "Período de teste"),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s*\[\d{3}\]$/, "") : "Não foi possível concluir a operação. Tente novamente.";
}

export function PlatformSubscriptionPanel({
  trainerUid,
  trainerName,
  adminUid,
  accessStatus,
  billingStatus,
  billingUntil,
  canManage,
}: {
  trainerUid: string;
  trainerName: string;
  adminUid: string;
  accessStatus: "active" | "suspended";
  billingStatus: BillingStatus | null;
  billingUntil: number | null;
  canManage: boolean;
}) {
  const [templates, setTemplates] = useState<PlatformBillingPlanTemplate[]>([]);
  const [subscription, setSubscription] = useState<PlatformSubscription | null>(null);
  const [legacyInvoice, setLegacyInvoice] = useState<PlatformInvoice | null>(null);
  const [payments, setPayments] = useState<PlatformPayment[]>([]);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [linkedStudents, setLinkedStudents] = useState<number | null>(null);
  // The access state as stored right now: the page that opened this panel read it once, and it changes with every payment.
  const [billing, setBilling] = useState<{ status: BillingStatus | null; until: number | null }>({ status: billingStatus, until: billingUntil });
  const [inviteCode, setInviteCode] = useState("");
  const [inviteResolutionReason, setInviteResolutionReason] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [terms, setTerms] = useState<TermsDraft>(EMPTY_TERMS);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [trialExtensionDays, setTrialExtensionDays] = useState("");
  const [trialExtensionReason, setTrialExtensionReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PlatformPayment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [today, setToday] = useState("");
  const [now, setNow] = useState(() => Date.now());
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
      loadPlatformSubscription(firebase.db, trainerUid),
      loadTrainerPlatformPayments(firebase.db, trainerUid).then((value) => ({ value, failed: null as string | null }), (reason: unknown) => ({ value: [] as PlatformPayment[], failed: errorText(reason) })),
      countLinkedStudents(firebase.db, trainerUid).catch(() => null),
      loadTrainerBilling(firebase.db, trainerUid).catch(() => null),
    ]).then(([loadedTemplates, view, paymentResult, linked, liveBilling]) => {
      if (cancelled) return;
      if (liveBilling) setBilling(liveBilling);
      setTemplates(loadedTemplates);
      setSubscription(view.subscription);
      setLegacyInvoice(view.currentInvoice);
      setPayments(paymentResult.value);
      setPaymentsError(paymentResult.failed);
      setLinkedStudents(linked);
      const selectedTemplateId = view.subscription?.terms.templateId ?? "";
      setTemplateId(selectedTemplateId);
      const selectedTemplate = loadedTemplates.find((item) => item.id === selectedTemplateId);
      setTerms(view.subscription
        ? termsDraft(view.subscription.terms)
        : selectedTemplate ? termsDraft(selectedTemplate) : EMPTY_TERMS);
      setEffectiveDate(localDate(view.subscription?.effectiveAt ?? Date.now()));
      setError(null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) {
        setToday(localDate(Date.now()));
        setNow(Date.now());
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [trainerUid, reloadVersion]);

  const mensalidade = useMemo(
    () => mensalidadeOf({ hasSubscription: subscription !== null, billingStatus: billing.status, billingUntil: billing.until }, now),
    [subscription, billing, now],
  );
  const planName = subscription ? subscription.terms.planName ?? templates.find((item) => item.id === subscription.terms.templateId)?.name ?? "Plano" : null;
  const lastActivePaymentId = payments.find((payment) => payment.voidedAt === null)?.id ?? null;
  const selectedTemplate = templates.find((item) => item.id === templateId);
  const estimatedAmount = subscription && linkedStudents !== null ? effectivePlatformMonthlyAmountCents(subscription.terms, linkedStudents) : null;

  function selectTemplate(nextId: string) {
    setTemplateId(nextId);
    const selected = templates.find((item) => item.id === nextId);
    if (selected) setTerms(termsDraft(selected));
    setError(null);
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading) return;
    if (!templateId) { setError("Escolha um plano antes de salvar."); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await assignPlatformSubscription(getFirebase().db, adminUid, trainerUid, {
        templateId,
        terms: parsedTerms(terms),
        effectiveAt: new Date(`${effectiveDate}T00:00:00-03:00`).getTime(),
      });
      setSubscription(saved);
      setNotice(`Plano salvo na versão ${saved.terms.snapshotVersion}. O vencimento atual não mudou.`);
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function confirmVoid() {
    if (!voidTarget || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await voidPlatformPayment(getFirebase().db, adminUid, voidTarget.id, voidReason);
      setNotice("Pagamento estornado e registrado na auditoria. O acesso voltou ao estado anterior.");
      setVoidTarget(null); setVoidReason("");
      setReloadVersion((value) => value + 1);
    } catch (reason) { setError(errorText(reason)); setVoidTarget(null); }
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

  return <section className="panel">
    <h2>Mensalidade</h2>
    {error && <FocusNotice role="alert">{error}</FocusNotice>}
    {notice && <FocusNotice>{notice}</FocusNotice>}
    {loading ? <p className="loading" role="status">Carregando plano e pagamentos…</p> : <>
      <div className="admin-grid">
        <dl className="admin-figure"><dt>Plano cadastrado</dt><dd>{planName ?? "Sem plano"}</dd></dl>
        <dl className="admin-figure"><dt>Situação</dt><dd><span className="admin-status" data-state={mensalidade.state}>{mensalidadeStateName(mensalidade.state)}</span></dd></dl>
        <dl className="admin-figure"><dt>Expira em</dt><dd>{mensalidade.expiresOn ? formatDate(mensalidade.expiresOn) : "—"}</dd></dl>
        <dl className="admin-figure"><dt>Acesso da conta</dt><dd>{accessStatus === "active" ? "Ativo" : "Suspenso"}</dd></dl>
      </div>
      <p><strong>{mensalidadeLabel(mensalidade)}</strong>{billing.until !== null && <> · acesso por cobrança até <DateTime at={billing.until} /></>}</p>
      <p className="admin-muted">É o que este personal paga à plataforma, separado do que ele cobra dos próprios alunos. A suspensão manual da conta é independente.</p>
      {canManage && <div className="page-actions">
        {subscription
          ? <button type="button" className="button-primary" disabled={busy} onClick={() => { setNotice(null); setPayOpen(true); }}>Marcar como pago</button>
          : <button type="button" className="button-primary" disabled={busy} onClick={() => { setNotice(null); setAssignOpen(true); }}>Cadastrar plano</button>}
      </div>}

      {subscription && <section>
        <h3>Valores e uso</h3>
        <dl>
          <div><dt>Mensalidade · alunos incluídos · adicional por aluno excedente</dt><dd><Money cents={subscription.terms.monthlyBaseCents} /> · {subscription.terms.includedStudentSeats} · <Money cents={subscription.terms.extraStudentMonthlyCents} /></dd></div>
          <div><dt>Alunos vinculados agora</dt><dd>{linkedStudents ?? "Ainda sem dados"}{linkedStudents !== null && <> · {Math.max(0, subscription.terms.includedStudentSeats - linkedStudents)} vagas incluídas restantes</>}</dd></div>
          {estimatedAmount !== null && <div><dt>Valor sugerido para este mês (alunos vinculados)</dt><dd><Money cents={estimatedAmount} /></dd></div>}
          <div><dt>Códigos de convite ativos ao mesmo tempo</dt><dd>máximo de {subscription.terms.maxActiveInviteCodes}</dd></div>
          <div><dt>Período de teste do plano</dt><dd>{subscription.terms.trialDurationDays === 0 ? "Sem teste" : `${subscription.terms.trialDurationDays} dias`}</dd></div>
          <div><dt>Termos atuais</dt><dd>versão {subscription.terms.snapshotVersion} · modelo {planName} v{subscription.terms.templateVersion} · desde <DateTime at={subscription.effectiveAt} /></dd></div>
          {subscription.trialStartedAt !== null && <div><dt>Teste</dt><dd><DateTime at={subscription.trialStartedAt} /> até <DateTime at={subscription.trialEndsAt} /></dd></div>}
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

      <section>
        <h3>Pagamentos</h3>
        {paymentsError && <p className="admin-muted" role="status">{paymentsError}</p>}
        {payments.length === 0 ? <Empty>Nenhum pagamento registrado para este personal.</Empty> : <ul className="admin-list">
          {payments.map((payment) => <li key={payment.id}>
            <span>
              <strong><Money cents={payment.amountCents} /> · acesso até {formatDate(payment.paidThroughDate)}</strong>{payment.voidedAt !== null && <> <span className="admin-status" data-state="atrasado">Estornado</span></>}
              <br /><small>Registrado em <DateTime at={payment.paidAt} /> · plano {payment.planName}{payment.paymentReference ? ` · ref. ${payment.paymentReference}` : ""}</small>
            </span>
            {canManage && payment.id === lastActivePaymentId && <button type="button" disabled={busy} onClick={() => { setVoidReason(""); setVoidTarget(payment); }}>Estornar</button>}
          </li>)}
        </ul>}
      </section>

      {legacyInvoice && <section>
        <h3>Fatura anterior</h3>
        <p className="admin-muted">Emitida antes das mensalidades por pagamento; fica só para consulta.</p>
        <dl>
          <div><dt>Competência · vencimento · status</dt><dd>{legacyInvoice.period} · {formatDate(legacyInvoice.dueDate)} · {legacyInvoice.status === "paid" ? "Paga" : "Em aberto"}</dd></div>
          <div><dt>Total</dt><dd><Money cents={legacyInvoice.amountCents} /></dd></div>
        </dl>
      </section>}

      {canManage && <>
        <form onSubmit={(event) => void saveAssignment(event)}>
          <h3>{subscription ? "Trocar o plano ou ajustar os valores deste personal" : "Cadastrar plano deste personal"}</h3>
          {templates.length === 0 ? <p role="alert">Crie um plano em Modelos de plano antes de atribuí-lo.</p> : <>
            <p><label>Plano
              <select required value={templateId} onChange={(event) => selectTemplate(event.target.value)}>
                <option value="">Escolha um plano</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · versão {template.version}</option>)}
              </select>
            </label></p>
            <p><label>Data de início<input type="date" required max={today || undefined} value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} /></label></p>
            <p>
              <label>Mensalidade (R$)<input required inputMode="decimal" placeholder="0,00" value={terms.monthlyBase} onChange={(event) => setTerms((current) => ({ ...current, monthlyBase: event.target.value }))} /></label>
              <label>Alunos incluídos<input type="number" min="0" step="1" required value={terms.includedStudentSeats} onChange={(event) => setTerms((current) => ({ ...current, includedStudentSeats: event.target.value }))} /></label>
              <label>Adicional mensal por aluno excedente (R$)<input required inputMode="decimal" placeholder="0,00" value={terms.extraStudentMonthly} onChange={(event) => setTerms((current) => ({ ...current, extraStudentMonthly: event.target.value }))} /></label>
            </p>
            <p>
              <label>Máximo de códigos de convite ativos ao mesmo tempo<input type="number" min="0" step="1" required value={terms.maxActiveInviteCodes} onChange={(event) => setTerms((current) => ({ ...current, maxActiveInviteCodes: event.target.value }))} /></label>
              <label>Período de teste (dias)<input type="number" min="0" step="1" required value={terms.trialDurationDays} onChange={(event) => setTerms((current) => ({ ...current, trialDurationDays: event.target.value }))} /></label>
            </p>
            {subscription === null && selectedTemplate && effectiveDate && <p role="status"><strong>{assignmentConsequence({ ...selectedTemplate, trialDurationDays: Number(terms.trialDurationDays) || 0 }, effectiveDate)}</strong></p>}
            {subscription !== null && <p className="admin-muted">Trocar o plano ou os valores vale daqui para frente: o vencimento atual não muda e um personal não ganha um segundo teste.</p>}
            <button type="submit" aria-disabled={busy || loading || !templateId}>{busy ? "Salvando…" : subscription ? "Salvar alterações" : "Cadastrar plano"}</button>
          </>}
        </form>

        <section>
          <h3>Resolver convite informado pelo personal</h3>
          <p>Para proteger os dados do aluno, esta tela não lista documentos de convite. Convites sem vencimento seguem ativos até serem cancelados; peça o código ao personal para resolvê-lo.</p>
          <form onSubmit={(event) => { event.preventDefault(); void resolveInvite(inviteCode); }}>
            <p>
              <label>Código de 8 caracteres<input required minLength={8} maxLength={8} pattern="[A-Fa-f0-9]{8}" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} /></label>
              <label>Motivo para resolver<input required maxLength={200} value={inviteResolutionReason} onChange={(event) => setInviteResolutionReason(event.target.value)} /></label>
            </p>
            <button type="submit" aria-disabled={busy || !inviteCode.trim() || !inviteResolutionReason.trim()}>{busy ? "Resolvendo…" : "Resolver código"}</button>
          </form>
        </section>
      </>}
    </>}

    {payOpen && subscription && <MarkPaidDialog
      adminUid={adminUid}
      target={{
        trainerUid,
        trainerName,
        planName: planName ?? "",
        terms: subscription.terms,
        billingStatus: billing.status,
        billingUntil: billing.until,
      }}
      onClose={() => setPayOpen(false)}
      onDone={(payment) => { setPayOpen(false); setNotice(`Pagamento registrado. Acesso até ${formatDate(payment.paidThroughDate)}.`); setReloadVersion((value) => value + 1); }}
    />}
    {assignOpen && <AssignPlanDialog
      adminUid={adminUid}
      trainerUid={trainerUid}
      trainerName={trainerName}
      templates={templates}
      onClose={() => setAssignOpen(false)}
      onDone={() => { setAssignOpen(false); setNotice("Plano cadastrado."); setReloadVersion((value) => value + 1); }}
    />}
    <ConfirmDialog
      open={voidTarget !== null}
      title="Estornar pagamento"
      yesLabel={busy ? "Estornando…" : "Estornar"}
      noLabel="Cancelar"
      onYes={() => void confirmVoid()}
      onNo={() => { if (!busy) setVoidTarget(null); }}
    >
      {voidTarget && <p>O pagamento de <Money cents={voidTarget.amountCents} /> sai da conta e o acesso volta ao estado anterior (vencimento {voidTarget.previousUntil === null ? "sem data" : formatDate(localDate(voidTarget.previousUntil))}). Só vale para o último pagamento.</p>}
      <p><label>Motivo<input required maxLength={200} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /></label></p>
    </ConfirmDialog>
  </section>;
}
