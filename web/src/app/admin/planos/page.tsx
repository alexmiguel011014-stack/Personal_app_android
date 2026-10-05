"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  createPlatformPlanTemplate,
  loadPlatformPlanTemplates,
  loadPlatformTrialDefaults,
  savePlatformTrialDefaults,
  updatePlatformPlanTemplate,
  type EditablePlatformPlanTemplate,
  type PlatformTrialDefaults,
} from "../../../data/platformPlans";
import { getFirebase } from "../../../data/firebase";
import type { PlatformBillingPlanTemplate } from "../../../domain/platformBilling";
import { formatCents, parseAmountCents } from "../../../domain/payments";
import { useSession } from "../../SessionProvider";
import { Empty, Money, PageHeading } from "../AdminPrimitives";

type TemplateDraft = {
  name: string;
  monthlyBase: string;
  includedStudentSeats: string;
  extraStudentMonthly: string;
  maxActiveInviteCodes: string;
  trialMaxStudentSeats: string;
  trialDurationDays: string;
};

type TrialDraft = { trialMaxStudentSeats: string; trialDurationDays: string; defaultPlanTemplateId: string };

const EMPTY_TEMPLATE: TemplateDraft = {
  name: "",
  monthlyBase: "",
  includedStudentSeats: "",
  extraStudentMonthly: "",
  maxActiveInviteCodes: "",
  trialMaxStudentSeats: "",
  trialDurationDays: "",
};

const EMPTY_TRIAL: TrialDraft = { trialMaxStudentSeats: "", trialDurationDays: "", defaultPlanTemplateId: "" };

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
    monthlyBaseCents: centsField(draft.monthlyBase, "Mensalidade base"),
    includedStudentSeats: integerField(draft.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: centsField(draft.extraStudentMonthly, "Adicional por aluno"),
    maxActiveInviteCodes: integerField(draft.maxActiveInviteCodes, "Limite de convites ativos"),
    trialMaxStudentSeats: integerField(draft.trialMaxStudentSeats, "Alunos no teste"),
    trialDurationDays: integerField(draft.trialDurationDays, "Duração do teste"),
  };
}

function templateDraft(template: PlatformBillingPlanTemplate): TemplateDraft {
  return {
    name: template.name,
    monthlyBase: formatCents(template.monthlyBaseCents).replace(/^R\$\s*/, ""),
    includedStudentSeats: String(template.includedStudentSeats),
    extraStudentMonthly: formatCents(template.extraStudentMonthlyCents).replace(/^R\$\s*/, ""),
    maxActiveInviteCodes: String(template.maxActiveInviteCodes),
    trialMaxStudentSeats: String(template.trialMaxStudentSeats),
    trialDurationDays: String(template.trialDurationDays),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação. Tente novamente.";
}

export default function PlatformPlansPage() {
  const { session } = useSession();
  const adminUid = session.status === "signedIn" ? session.uid : "";
  const [templates, setTemplates] = useState<PlatformBillingPlanTemplate[]>([]);
  const [trialDefaults, setTrialDefaults] = useState<PlatformTrialDefaults | null>(null);
  const [trialDraft, setTrialDraft] = useState<TrialDraft>(EMPTY_TRIAL);
  const [defaultsReason, setDefaultsReason] = useState("");
  const [planDraft, setPlanDraft] = useState<TemplateDraft>(EMPTY_TEMPLATE);
  const [planReason, setPlanReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadPlatformPlanTemplates(getFirebase().db),
      loadPlatformTrialDefaults(getFirebase().db),
    ]).then(([items, defaults]) => {
      if (cancelled) return;
      setTemplates(items);
      setTrialDefaults(defaults);
      setTrialDraft(defaults
        ? {
          trialMaxStudentSeats: String(defaults.trialMaxStudentSeats),
          trialDurationDays: String(defaults.trialDurationDays),
          defaultPlanTemplateId: defaults.defaultPlanTemplateId ?? "",
        }
        : EMPTY_TRIAL);
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
    setPlanDraft({
      ...EMPTY_TEMPLATE,
      trialMaxStudentSeats: trialDefaults ? String(trialDefaults.trialMaxStudentSeats) : "",
      trialDurationDays: trialDefaults ? String(trialDefaults.trialDurationDays) : "",
    });
    setEditorOpen(true);
    setPlanReason("");
    setError(null);
    setNotice(null);
  }

  function beginEdit(template: PlatformBillingPlanTemplate) {
    setEditingId(template.id);
    setPlanDraft(templateDraft(template));
    setEditorOpen(true);
    setPlanReason("");
    setError(null);
    setNotice(null);
  }

  async function saveTrial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const saved = await savePlatformTrialDefaults(getFirebase().db, adminUid, {
        trialMaxStudentSeats: integerField(trialDraft.trialMaxStudentSeats, "Alunos no teste"),
        trialDurationDays: integerField(trialDraft.trialDurationDays, "Duração do teste"),
        defaultPlanTemplateId: trialDraft.defaultPlanTemplateId || null,
      }, defaultsReason);
      setTrialDefaults(saved);
      setTrialDraft({
        trialMaxStudentSeats: String(saved.trialMaxStudentSeats),
        trialDurationDays: String(saved.trialDurationDays),
        defaultPlanTemplateId: saved.defaultPlanTemplateId ?? "",
      });
      setNotice(`Padrões salvos na versão ${saved.version}. O plano escolhido vale para novos personais; contas e snapshots existentes não são alterados.`);
      setDefaultsReason("");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const values = templateValues(planDraft);
      const saved = editingId
        ? await updatePlatformPlanTemplate(getFirebase().db, adminUid, editingId, values, planReason)
        : await createPlatformPlanTemplate(getFirebase().db, adminUid, values, planReason);
      setTemplates((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setNotice(`Plano “${saved.name}” salvo na versão ${saved.version}. Personais já vinculados mantêm seu snapshot atual.`);
      setEditingId(null);
      setEditorOpen(false);
      setPlanDraft(EMPTY_TEMPLATE);
      setPlanReason("");
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  return <main>
    <PageHeading title="Planos e padrões">Configure os modelos para novas contas de personal e as condições padrão do teste grátis.</PageHeading>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading && <p className="loading" role="status">Carregando planos e padrões…</p>}

    <section className="panel">
      <h2>Padrão do teste grátis</h2>
      <p>Escolha o modelo aplicado a novos personais e os limites padrão do teste. Sem um modelo selecionado, a atribuição fica manual. Isso não altera contas nem snapshots existentes.</p>
      {trialDefaults && <p className="admin-muted">Versão atual: {trialDefaults.version}</p>}
      <form onSubmit={(event) => void saveTrial(event)}>
        <p>
          <label>Plano padrão para novos personais
            <select value={trialDraft.defaultPlanTemplateId} onChange={(event) => setTrialDraft((value) => ({ ...value, defaultPlanTemplateId: event.target.value }))}>
              <option value="">Atribuir manualmente</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name} · versão {template.version}</option>)}
            </select>
          </label>
          <label>Máximo de alunos vinculados durante o teste
            <input type="number" min="0" step="1" required value={trialDraft.trialMaxStudentSeats} onChange={(event) => setTrialDraft((value) => ({ ...value, trialMaxStudentSeats: event.target.value }))} />
          </label>
          <label>Duração do teste (dias)
            <input type="number" min="0" step="1" required value={trialDraft.trialDurationDays} onChange={(event) => setTrialDraft((value) => ({ ...value, trialDurationDays: event.target.value }))} />
          </label>
        </p>
        <p><label>Motivo da alteração<input required maxLength={200} value={defaultsReason} onChange={(event) => setDefaultsReason(event.target.value)} /></label></p>
        <button type="submit" disabled={busy || loading}>{busy ? "Salvando…" : "Salvar padrão do teste"}</button>
      </form>
    </section>

    <section className="panel">
      <div className="page-actions"><div><h2>Modelos de plano</h2><p>Valores em reais são armazenados como centavos inteiros. Cada edição cria uma nova versão do modelo.</p></div>
        <button type="button" onClick={beginNewTemplate} disabled={busy || loading}>Novo plano</button>
      </div>

      {editorOpen && <form onSubmit={(event) => void saveTemplate(event)}>
        <h3>{editingId ? "Editar modelo" : "Novo modelo"}</h3>
        <p><label>Nome do plano<input required maxLength={80} value={planDraft.name} onChange={(event) => setPlanDraft((value) => ({ ...value, name: event.target.value }))} /></label></p>
        <p>
          <label>Mensalidade base (R$)<input required inputMode="decimal" placeholder="0,00" value={planDraft.monthlyBase} onChange={(event) => setPlanDraft((value) => ({ ...value, monthlyBase: event.target.value }))} /></label>
          <label>Alunos incluídos<input type="number" min="0" step="1" required value={planDraft.includedStudentSeats} onChange={(event) => setPlanDraft((value) => ({ ...value, includedStudentSeats: event.target.value }))} /></label>
          <label>Adicional mensal por aluno excedente (R$)<input required inputMode="decimal" placeholder="0,00" value={planDraft.extraStudentMonthly} onChange={(event) => setPlanDraft((value) => ({ ...value, extraStudentMonthly: event.target.value }))} /></label>
        </p>
        <p><label>Motivo da alteração<input required maxLength={200} value={planReason} onChange={(event) => setPlanReason(event.target.value)} /></label></p>
        <p>
          <label>Máximo de códigos de convite ativos ao mesmo tempo<input type="number" min="0" step="1" required value={planDraft.maxActiveInviteCodes} onChange={(event) => setPlanDraft((value) => ({ ...value, maxActiveInviteCodes: event.target.value }))} /></label>
          <label>Máximo de alunos durante o teste<input type="number" min="0" step="1" required value={planDraft.trialMaxStudentSeats} onChange={(event) => setPlanDraft((value) => ({ ...value, trialMaxStudentSeats: event.target.value }))} /></label>
          <label>Duração do teste deste plano (dias)<input type="number" min="0" step="1" required value={planDraft.trialDurationDays} onChange={(event) => setPlanDraft((value) => ({ ...value, trialDurationDays: event.target.value }))} /></label>
        </p>
        <div className="page-actions"><button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar modelo"}</button><button type="button" disabled={busy} onClick={() => { setEditorOpen(false); setEditingId(null); setPlanDraft(EMPTY_TEMPLATE); }}>Cancelar</button></div>
      </form>}

      {loading ? null : templates.length === 0 ? <Empty>Nenhum modelo cadastrado. Crie um plano para usá-lo como padrão ao configurar um personal.</Empty> : <div className="admin-cards">{templates.map((template) => <article className="admin-card" key={template.id}>
        <div className="page-actions"><div><h3>{template.name}</h3><p className="admin-muted">Versão {template.version}</p></div><button type="button" disabled={busy} onClick={() => beginEdit(template)}>Editar</button></div>
        <dl>
          <div><dt>Base mensal · alunos incluídos</dt><dd><Money cents={template.monthlyBaseCents} /> · {template.includedStudentSeats}</dd></div>
          <div><dt>Adicional mensal por aluno excedente</dt><dd><Money cents={template.extraStudentMonthlyCents} /></dd></div>
          <div><dt>Códigos ativos máximos</dt><dd>{template.maxActiveInviteCodes}</dd></div>
          <div><dt>Teste grátis · alunos · duração</dt><dd>{template.trialMaxStudentSeats} · {template.trialDurationDays} dias</dd></div>
        </dl>
      </article>)}</div>}
    </section>
  </main>;
}
