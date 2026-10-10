"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  createPlatformPlanTemplate,
  loadPlatformPlanTemplates,
  updatePlatformPlanTemplate,
  type EditablePlatformPlanTemplate,
} from "../../../data/platformPlans";
import { getFirebase } from "../../../data/firebase";
import type { PlatformBillingPlanTemplate } from "../../../domain/platformBilling";
import { formatCents, parseAmountCents } from "../../../domain/payments";
import { useSession } from "../../SessionProvider";
import { FocusNotice } from "../../_shared/FocusNotice";
import { Empty, Money, PageHeading } from "../AdminPrimitives";

type TemplateDraft = {
  name: string;
  monthlyBase: string;
  includedStudentSeats: string;
  extraStudentMonthly: string;
  maxActiveInviteCodes: string;
  trialDurationDays: string;
};

const EMPTY_TEMPLATE: TemplateDraft = {
  name: "",
  monthlyBase: "",
  includedStudentSeats: "",
  extraStudentMonthly: "",
  maxActiveInviteCodes: "",
  trialDurationDays: "",
};

function integerField(value: string, label: string): number {
  const text = value.trim();
  if (!/^\d+$/.test(text)) throw new Error(`${label}: informe um número inteiro igual ou maior que zero.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label}: o número informado é grande demais.`);
  return parsed;
}

function centsField(value: string, label: string): number {
  const parsed = parseAmountCents(value);
  if (parsed === null) throw new Error(`${label}: informe um valor válido em reais, como 150,00.`);
  return parsed;
}

function templateValues(draft: TemplateDraft): EditablePlatformPlanTemplate {
  const name = draft.name.trim();
  if (name.length === 0 || name.length > 80) throw new Error("O nome precisa ter entre 1 e 80 caracteres.");
  return {
    name,
    monthlyBaseCents: centsField(draft.monthlyBase, "Mensalidade"),
    includedStudentSeats: integerField(draft.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: centsField(draft.extraStudentMonthly, "Adicional por aluno"),
    maxActiveInviteCodes: integerField(draft.maxActiveInviteCodes, "Limite de convites ativos"),
    trialDurationDays: integerField(draft.trialDurationDays, "Período de teste"),
  };
}

function templateDraft(template: PlatformBillingPlanTemplate): TemplateDraft {
  return {
    name: template.name,
    monthlyBase: formatCents(template.monthlyBaseCents).replace(/^R\$\s*/, ""),
    includedStudentSeats: String(template.includedStudentSeats),
    extraStudentMonthly: formatCents(template.extraStudentMonthlyCents).replace(/^R\$\s*/, ""),
    maxActiveInviteCodes: String(template.maxActiveInviteCodes),
    trialDurationDays: String(template.trialDurationDays),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s*\[\d{3}\]$/, "") : "Não foi possível concluir a operação. Tente novamente.";
}

export default function PlatformPlansPage() {
  const { session } = useSession();
  const adminUid = session.status === "signedIn" ? session.uid : "";
  const [templates, setTemplates] = useState<PlatformBillingPlanTemplate[]>([]);
  const [planDraft, setPlanDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadPlatformPlanTemplates(getFirebase().db).then((items) => {
      if (cancelled) return;
      setTemplates(items);
      setError(null);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(errorText(reason));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  function beginNewTemplate() {
    setEditingId(null);
    setPlanDraft(EMPTY_TEMPLATE);
    setEditorOpen(true);
    setError(null);
    setNotice(null);
  }

  function beginEdit(template: PlatformBillingPlanTemplate) {
    setEditingId(template.id);
    setPlanDraft(templateDraft(template));
    setEditorOpen(true);
    setError(null);
    setNotice(null);
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const values = templateValues(planDraft);
      const saved = editingId
        ? await updatePlatformPlanTemplate(getFirebase().db, adminUid, editingId, values)
        : await createPlatformPlanTemplate(getFirebase().db, adminUid, values);
      setTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setNotice(`Plano “${saved.name}” salvo na versão ${saved.version}. Personais que já usam este plano mantêm as condições atuais.`);
      setEditingId(null);
      setEditorOpen(false);
      setPlanDraft(EMPTY_TEMPLATE);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  return <main>
    <PageHeading title="Modelos de plano">Crie os planos que você atribui a cada personal. Os valores são em reais; cada edição cria uma nova versão e não muda quem já usa o plano.</PageHeading>
    {error && <FocusNotice role="alert">{error}</FocusNotice>}
    {notice && <FocusNotice>{notice}</FocusNotice>}
    {loading && <p className="loading" role="status">Carregando planos…</p>}

    <section className="panel">
      <div className="section-heading"><div><h2>Planos cadastrados</h2><p>Para colocar um personal em um plano, use a aba Mensalidades.</p></div>
        <button type="button" onClick={beginNewTemplate} disabled={busy || loading}>Novo plano</button>
      </div>

      {editorOpen && <form onSubmit={(event) => void saveTemplate(event)}>
        <h3>{editingId ? "Editar plano" : "Novo plano"}</h3>
        <p><label>Nome do plano<input required maxLength={80} value={planDraft.name} onChange={(event) => setPlanDraft((value) => ({ ...value, name: event.target.value }))} /></label></p>
        <p>
          <label>Mensalidade (R$)<input required inputMode="decimal" placeholder="0,00" value={planDraft.monthlyBase} onChange={(event) => setPlanDraft((value) => ({ ...value, monthlyBase: event.target.value }))} /></label>
          <label>Alunos incluídos<input type="number" min="0" step="1" required value={planDraft.includedStudentSeats} onChange={(event) => setPlanDraft((value) => ({ ...value, includedStudentSeats: event.target.value }))} /></label>
          <label>Adicional mensal por aluno excedente (R$)<input required inputMode="decimal" placeholder="0,00" value={planDraft.extraStudentMonthly} onChange={(event) => setPlanDraft((value) => ({ ...value, extraStudentMonthly: event.target.value }))} /></label>
        </p>
        <p>
          <label>Máximo de códigos de convite ativos ao mesmo tempo<input type="number" min="0" step="1" required value={planDraft.maxActiveInviteCodes} onChange={(event) => setPlanDraft((value) => ({ ...value, maxActiveInviteCodes: event.target.value }))} /></label>
          <label>Período de teste (dias)<input type="number" min="0" step="1" required aria-describedby="trial-hint" value={planDraft.trialDurationDays} onChange={(event) => setPlanDraft((value) => ({ ...value, trialDurationDays: event.target.value }))} /></label>
        </p>
        <p id="trial-hint" className="admin-muted">0 = sem teste: o personal só entra depois do primeiro pagamento. Com dias, o teste é em aberto (sem limite de alunos) e a cobrança começa depois dele.</p>
        <div className="page-actions"><button type="submit" aria-disabled={busy}>{busy ? "Salvando…" : "Salvar plano"}</button><button type="button" disabled={busy} onClick={() => { setEditorOpen(false); setEditingId(null); setPlanDraft(EMPTY_TEMPLATE); }}>Cancelar</button></div>
      </form>}

      {loading ? null : templates.length === 0 ? <Empty>Nenhum plano cadastrado. Crie o primeiro para poder atribuí-lo a um personal.</Empty> : <div className="admin-cards">{templates.map((template) => <article className="admin-card" key={template.id}>
        <div className="page-actions"><div><h3>{template.name}</h3><p className="admin-muted">Versão {template.version}</p></div><button type="button" disabled={busy} onClick={() => beginEdit(template)}>Editar</button></div>
        <dl>
          <div><dt>Mensalidade · alunos incluídos</dt><dd><Money cents={template.monthlyBaseCents} /> · {template.includedStudentSeats}</dd></div>
          <div><dt>Adicional mensal por aluno excedente</dt><dd><Money cents={template.extraStudentMonthlyCents} /></dd></div>
          <div><dt>Códigos de convite ativos ao mesmo tempo</dt><dd>{template.maxActiveInviteCodes}</dd></div>
          <div><dt>Período de teste</dt><dd>{template.trialDurationDays === 0 ? "Sem teste" : `${template.trialDurationDays} ${template.trialDurationDays === 1 ? "dia" : "dias"} de teste`}</dd></div>
        </dl>
      </article>)}</div>}
    </section>
  </main>;
}
