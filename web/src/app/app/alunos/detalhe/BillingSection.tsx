"use client";

import { useState, type FormEvent } from "react";
import { createPlan, setPlanActive, updatePlan } from "../../../../data/billing";
import { getFirebase } from "../../../../data/firebase";
import type { TrainerSnapshot } from "../../../../data/trainerData";
import { billingOwners, chargesOf, parsePlanInput, plansOf } from "../../../../domain/billing";
import { formatYearMonth, yearMonth } from "../../../../domain/dates";
import { firstBillableMonth, formatCents, type BillingPlan } from "../../../../domain/payments";
import { ChargesTable } from "../../ChargesTable";

// GOALS.md §23g: a student's mensalidade — the plan their monthly charge is generated from, and
// every charge so far. Drafts too: billing doesn't depend on the student using the app (see
// domain/billing.ts for how a plan registered on a draft follows the person once they connect).

export function BillingSection({
  trainerId,
  studentId,
  snapshot,
  today,
  timeZone,
  onChanged,
}: {
  trainerId: string;
  studentId: string;
  snapshot: TrainerSnapshot;
  today: string;
  timeZone: string;
  onChanged: () => void;
}) {
  const owners = billingOwners(snapshot.students, snapshot.claimedDraftByAccount);
  const plans = plansOf(studentId, snapshot.plans, owners);
  const charges = chargesOf(studentId, snapshot.payments, owners);

  return (
    <section>
      <h2>Mensalidade</h2>
      <p>Só você vê as mensalidades — o aluno não.</p>
      {plans.length === 0 ? (
        <PlanForm
          legend="Cadastrar mensalidade"
          submitLabel="Cadastrar"
          onSubmit={async (amountCents, dueDay) => {
            await createPlan(getFirebase().db, trainerId, studentId, amountCents, dueDay, Date.now());
            onChanged();
          }}
        />
      ) : (
        plans.map((plan) => (
          <PlanView key={plan.studentId} plan={plan} today={today} timeZone={timeZone} onChanged={onChanged} />
        ))
      )}
      {charges.length === 0 ? (
        <p>Nenhuma cobrança ainda.</p>
      ) : (
        <ChargesTable caption="Cobranças" charges={charges} today={today} timeZone={timeZone} onChanged={onChanged} />
      )}
    </section>
  );
}

function PlanView({
  plan,
  today,
  timeZone,
  onChanged,
}: {
  plan: BillingPlan;
  today: string;
  timeZone: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = firstBillableMonth(plan, timeZone);

  async function toggle() {
    setError(null);
    try {
      await setPlanActive(getFirebase().db, plan.studentId, !plan.active);
      onChanged();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  if (editing) {
    return (
      <PlanForm
        legend="Editar mensalidade"
        submitLabel="Salvar"
        initial={plan}
        note="Vale para as próximas cobranças; uma já gerada se ajusta na tabela abaixo."
        onCancel={() => setEditing(false)}
        onSubmit={async (amountCents, dueDay) => {
          await updatePlan(getFirebase().db, plan.studentId, amountCents, dueDay);
          setEditing(false);
          onChanged();
        }}
      />
    );
  }
  return (
    <>
      <p>
        {formatCents(plan.amountCents)} por mês, vencimento todo dia {plan.dueDay}
        {plan.dueDay > 28 && " (no último dia do mês, quando o mês é mais curto)"} —{" "}
        {plan.active ? "ativa" : "pausada: nenhuma cobrança nova é gerada"}.
      </p>
      {plan.active && first > yearMonth(today) && <p>A primeira cobrança sai em {formatYearMonth(first)}.</p>}
      <p>
        <button type="button" onClick={() => setEditing(true)}>
          Editar
        </button>{" "}
        <button type="button" onClick={() => void toggle()}>
          {plan.active ? "Pausar" : "Reativar"}
        </button>
      </p>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function PlanForm({
  legend,
  submitLabel,
  initial,
  note,
  onSubmit,
  onCancel,
}: {
  legend: string;
  submitLabel: string;
  initial?: BillingPlan;
  note?: string;
  onSubmit: (amountCents: number, dueDay: number) => Promise<void>;
  onCancel?: () => void;
}) {
  const [amount, setAmount] = useState(initial ? formatCents(initial.amountCents).replace(/^R\$\s*/, "") : "");
  const [dueDay, setDueDay] = useState(initial ? String(initial.dueDay) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePlanInput(amount, dueDay);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(parsed.amountCents, parsed.dueDay);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <fieldset>
        <legend>{legend}</legend>
        <label>
          Valor mensal (R$) <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>{" "}
        <label>
          Dia do vencimento <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </label>{" "}
        <button type="submit" disabled={busy}>
          {busy ? "Salvando…" : submitLabel}
        </button>
        {onCancel && (
          <>
            {" "}
            <button type="button" onClick={onCancel}>
              Cancelar
            </button>
          </>
        )}
        {note && <p>{note}</p>}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}
