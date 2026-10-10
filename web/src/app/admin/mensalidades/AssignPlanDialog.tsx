"use client";

import Link from "next/link";
import { useState } from "react";
import { getFirebase } from "../../../data/firebase";
import { assignPlatformSubscription, type PlatformSubscription } from "../../../data/platformSubscriptions";
import { addDays, formatDate, localDate } from "../../../domain/dates";
import type { PlatformBillingPlanTemplate } from "../../../domain/platformBilling";
import { ConfirmDialog } from "../../_shared/ConfirmDialog";
import { useRestoreFocus } from "../../_shared/useRestoreFocus";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s*\[\d{3}\]$/, "") : "Não foi possível cadastrar o plano. Tente novamente.";
}

/** What assigning this plan on `date` does to a trainer who has no subscription yet (§35 D2). */
export function assignmentConsequence(template: PlatformBillingPlanTemplate, date: string): string {
  if (template.trialDurationDays > 0) {
    return `Teste grátis de ${template.trialDurationDays} ${template.trialDurationDays === 1 ? "dia" : "dias"}, até ${formatDate(addDays(date, template.trialDurationDays))}. A cobrança começa depois dele.`;
  }
  return "Sem teste: o acesso só começa depois do primeiro pagamento.";
}

/**
 * GOALS.md §35 — "Cadastrar plano" for a personal who has none: pick a plan and a start date. The plan's values are
 * copied as they are (a personalised copy is made in the trainer's detail page). Mount it only while open.
 */
export function AssignPlanDialog({
  trainerUid,
  trainerName,
  templates,
  adminUid,
  onClose,
  onDone,
}: {
  trainerUid: string;
  trainerName: string;
  templates: readonly PlatformBillingPlanTemplate[];
  adminUid: string;
  onClose: () => void;
  onDone: (subscription: PlatformSubscription) => void;
}) {
  useRestoreFocus();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [today] = useState(() => localDate(Date.now()));
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = templates.find((item) => item.id === templateId);

  async function confirm() {
    if (busy) return;
    if (!template) { setError("Escolha um plano."); return; }
    setBusy(true); setError(null);
    try {
      const saved = await assignPlatformSubscription(getFirebase().db, adminUid, trainerUid, {
        templateId: template.id,
        terms: {
          monthlyBaseCents: template.monthlyBaseCents,
          includedStudentSeats: template.includedStudentSeats,
          extraStudentMonthlyCents: template.extraStudentMonthlyCents,
          maxActiveInviteCodes: template.maxActiveInviteCodes,
          trialDurationDays: template.trialDurationDays,
        },
        effectiveAt: new Date(`${date}T00:00:00-03:00`).getTime(),
      });
      onDone(saved);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  }

  return <ConfirmDialog
    open
    title="Cadastrar plano"
    yesLabel={busy ? "Salvando…" : "Cadastrar plano"}
    noLabel="Cancelar"
    onYes={() => void confirm()}
    onNo={() => { if (!busy) onClose(); }}
  >
    <p><strong>{trainerName}</strong></p>
    {templates.length === 0 ? <p role="alert">Nenhum modelo de plano ainda. Crie um em <Link href="/admin/planos">Modelos de plano</Link>.</p> : <>
      <p><label>Plano
        <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          {templates.map((item) => <option key={item.id} value={item.id}>{item.name} · versão {item.version}</option>)}
        </select>
      </label></p>
      <p><label>Início<input type="date" required max={today} value={date} onChange={(event) => setDate(event.target.value)} /></label></p>
      {template && date && <p role="status"><strong>{assignmentConsequence(template, date)}</strong></p>}
      <p className="admin-muted">Para mudar valores só deste personal, abra os detalhes dele depois.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </ConfirmDialog>;
}
