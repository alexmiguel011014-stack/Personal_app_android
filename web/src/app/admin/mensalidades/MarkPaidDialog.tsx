"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { countLinkedStudents } from "../../../data/admin";
import { getFirebase } from "../../../data/firebase";
import { recordPlatformPayment, type PlatformPayment } from "../../../data/platformSubscriptions";
import { formatDate } from "../../../domain/dates";
import { nextPaidThrough, type BillingStatus } from "../../../domain/mensalidades";
import { effectivePlatformMonthlyAmountCents, type PlatformBillingTerms } from "../../../domain/platformBilling";
import { formatCents, parseAmountCents } from "../../../domain/payments";
import { ConfirmDialog } from "../../_shared/ConfirmDialog";
import { useRestoreFocus } from "../../_shared/useRestoreFocus";

export interface MarkPaidTarget {
  trainerUid: string;
  trainerName: string;
  planName: string;
  terms: Pick<PlatformBillingTerms, "monthlyBaseCents" | "includedStudentSeats" | "extraStudentMonthlyCents">;
  /** What the screen showed; the write is refused if the stored state differs (someone else changed it). */
  billingStatus: BillingStatus | null;
  billingUntil: number | null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s*\[\d{3}\]$/, "") : "Não foi possível registrar o pagamento. Tente novamente.";
}

/**
 * GOALS.md §35 — "Marcar como pago". One confirmation: the amount received (pre-filled from the plan and the linked
 * students, editable), an optional reference, and the date the access will run through. Mount it only while open, so
 * every opening starts from fresh defaults.
 */
export function MarkPaidDialog({
  target,
  adminUid,
  onClose,
  onDone,
}: {
  target: MarkPaidTarget;
  adminUid: string;
  onClose: () => void;
  onDone: (payment: PlatformPayment) => void;
}) {
  useRestoreFocus();
  const [amount, setAmount] = useState(() => formatCents(target.terms.monthlyBaseCents).replace(/^R\$\s*/, ""));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const edited = useRef(false);
  const { trainerUid } = target;
  const { monthlyBaseCents, includedStudentSeats, extraStudentMonthlyCents } = target.terms;

  // Base + extra students above the included seats, from the students linked to this trainer (invite reservations
  // are not readable here). Only a suggestion: the field stays editable.
  useEffect(() => {
    let cancelled = false;
    void countLinkedStudents(getFirebase().db, trainerUid).then((linked) => {
      if (cancelled || edited.current) return;
      const cents = effectivePlatformMonthlyAmountCents({ monthlyBaseCents, includedStudentSeats, extraStudentMonthlyCents }, linked);
      setAmount(formatCents(cents).replace(/^R\$\s*/, ""));
    }).catch(() => { /* keep the plan's base amount */ });
    return () => { cancelled = true; };
  }, [trainerUid, monthlyBaseCents, includedStudentSeats, extraStudentMonthlyCents]);

  const outcome = useMemo(() => {
    const base = target.billingStatus === "trial" || target.billingStatus === "current" ? target.billingUntil : null;
    return nextPaidThrough(now, base);
  }, [now, target.billingStatus, target.billingUntil]);

  async function confirm() {
    if (busy) return;
    const cents = parseAmountCents(amount);
    if (cents === null) { setError("Informe um valor válido em reais, como 150,00."); return; }
    setBusy(true); setError(null);
    try {
      const payment = await recordPlatformPayment(getFirebase().db, adminUid, target.trainerUid, {
        amountCents: cents,
        reference,
        expected: { status: target.billingStatus, until: target.billingUntil },
      });
      onDone(payment);
    } catch (reason) { setError(errorText(reason)); setBusy(false); }
  }

  return <ConfirmDialog
    open
    title="Marcar como pago"
    yesLabel={busy ? "Registrando…" : "Confirmar pagamento"}
    noLabel="Cancelar"
    onYes={() => void confirm()}
    onNo={() => { if (!busy) onClose(); }}
  >
    <p><strong>{target.trainerName}</strong> · plano {target.planName}</p>
    <p><label>Valor recebido (R$)<input inputMode="decimal" required value={amount} onChange={(event) => { edited.current = true; setAmount(event.target.value); }} /></label></p>
    <p><label>Referência <span className="quiet-count">opcional</span><input maxLength={120} value={reference} onChange={(event) => setReference(event.target.value)} /></label></p>
    <p>Não digite dados de cartão ou de conta bancária.</p>
    <p role="status"><strong>O acesso passa a valer até {formatDate(outcome.date)}.</strong></p>
    {error && <p role="alert">{error}</p>}
  </ConfirmDialog>;
}
