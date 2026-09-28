"use client";

import Link from "next/link";
import { useState } from "react";
import { billingOwners, plansOf } from "../../../domain/billing";
import { formatYearMonth, yearMonth } from "../../../domain/dates";
import { overdueCharges } from "../../../domain/metrics";
import { formatCents, monthTotals, type Payment } from "../../../domain/payments";
import { useSession } from "../../SessionProvider";
import { ChargesTable } from "../ChargesTable";
import { useTrainerData } from "../useTrainerData";

// GOALS.md §23g: every charge in one place — a month's (this one by default), what's still overdue
// from earlier months, and who has no mensalidade yet. Plans are registered on each student's page.
// Opening it keeps this month's charges current, as the dashboard does.

export default function BillingPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Billing trainerId={session.uid} />;
}

function Billing({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId, { ensureCharges: true });
  const [picked, setPicked] = useState<string | null>(null);

  if (data.status === "loading") return <p>Carregando…</p>;
  if (data.status === "error") {
    return (
      <main>
        <p role="alert">{data.message}</p>
        <button type="button" onClick={reload}>
          Tentar de novo
        </button>
      </main>
    );
  }

  const { snapshot, today, timeZone } = data;
  const month = picked ?? yearMonth(today);
  // This month and every month with a charge, newest first — a select, not <input type="month">,
  // which some browsers render as free text.
  const months = [...new Set([yearMonth(today), ...snapshot.payments.map((charge) => charge.dueDate.slice(0, 7))])]
    .sort()
    .reverse();
  const owners = billingOwners(snapshot.students, snapshot.claimedDraftByAccount);
  const nameOf = (charge: Payment) => owners.get(charge.studentId)?.name ?? "Aluno não encontrado";
  const byDueDateThenName = (a: Payment, b: Payment) =>
    a.dueDate.localeCompare(b.dueDate) || nameOf(a).localeCompare(nameOf(b), "pt-BR");

  const inMonth = snapshot.payments.filter((charge) => charge.dueDate.slice(0, 7) === month).sort(byDueDateThenName);
  const earlierOverdue = overdueCharges(snapshot.payments, today).filter((charge) => charge.dueDate.slice(0, 7) < month);
  const totals = monthTotals(snapshot.payments, month, timeZone);
  const withoutPlan = snapshot.students
    .filter((student) => plansOf(student.id, snapshot.plans, owners).length === 0)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <main>
      <h1>Mensalidades</h1>
      <p>
        <label>
          Mês{" "}
          <select value={month} onChange={(e) => setPicked(e.target.value)}>
            {months.map((option) => (
              <option key={option} value={option}>
                {formatYearMonth(option)}
              </option>
            ))}
          </select>
        </label>
      </p>
      {data.chargesCreated > 0 && <p role="status">{data.chargesCreated} cobrança(s) do mês gerada(s) agora.</p>}

      <section>
        <h2>{formatYearMonth(month)}</h2>
        <dl>
          <dt>Previsto (vencimentos no mês)</dt>
          <dd>{formatCents(totals.expectedCents)}</dd>
          <dt>Recebido no mês</dt>
          <dd>{formatCents(totals.receivedCents)}</dd>
        </dl>
        {inMonth.length === 0 ? (
          <p>Nenhuma cobrança vence neste mês.</p>
        ) : (
          <ChargesTable
            caption={`Vencimentos em ${formatYearMonth(month)}`}
            charges={inMonth}
            nameOf={nameOf}
            today={today}
            timeZone={timeZone}
            onChanged={reload}
          />
        )}
      </section>

      <section>
        <h2>Em atraso de meses anteriores</h2>
        {earlierOverdue.length === 0 ? (
          <p>Nenhuma.</p>
        ) : (
          <ChargesTable
            caption="Em atraso de meses anteriores"
            charges={earlierOverdue}
            nameOf={nameOf}
            today={today}
            timeZone={timeZone}
            onChanged={reload}
          />
        )}
      </section>

      <section>
        <h2>Sem mensalidade cadastrada</h2>
        {withoutPlan.length === 0 ? (
          <p>Todos os alunos têm mensalidade.</p>
        ) : (
          <>
            <p>Cadastre na página do aluno.</p>
            <ul>
              {withoutPlan.map((student) => (
                <li key={student.id}>
                  <Link href={`/app/alunos/detalhe?id=${encodeURIComponent(student.id)}`}>{student.name}</Link>
                  {!student.linked && " (aguardando conexão)"}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
