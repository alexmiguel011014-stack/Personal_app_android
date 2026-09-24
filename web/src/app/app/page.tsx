"use client";

import Link from "next/link";
import { dashboardFigures, ADHERENCE_WINDOW_DAYS, QUIET_AFTER_DAYS, SESSIONS_WINDOW_DAYS } from "../../domain/dashboard";
import { formatDate, formatYearMonth, yearMonth } from "../../domain/dates";
import { formatCents } from "../../domain/payments";
import { useSession } from "../SessionProvider";
import { useTrainerData } from "./useTrainerData";

// GOALS.md §23g: the trainer's home — §23c's numbers as plain lists, no styling (phase 1).

export default function TrainerHome() {
  const { session } = useSession();
  // RequireArea only renders this for a signed-in trainer.
  if (session.status !== "signedIn") return null;
  return <Dashboard trainerId={session.uid} />;
}

function Dashboard({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId, { ensureCharges: true });

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

  const { today, timeZone } = data;
  const figures = dashboardFigures(data.snapshot, today, timeZone);
  const nameOf = new Map(data.snapshot.students.map((s) => [s.id, s.name]));

  return (
    <main>
      <h1>Painel</h1>

      <section>
        <h2>Alunos</h2>
        <dl>
          <dt>Total</dt>
          <dd>{figures.students.total}</dd>
          <dt>Conectados</dt>
          <dd>{figures.students.linked}</dd>
          <dt>Aguardando conexão</dt>
          <dd>{figures.students.pending}</dd>
        </dl>
        <p>
          <Link href="/app/alunos">Ver todos os alunos</Link>
        </p>
      </section>

      <section>
        <h2>Treinos</h2>
        <dl>
          <dt>Sessões nos últimos {SESSIONS_WINDOW_DAYS} dias</dt>
          <dd>{figures.sessions}</dd>
          <dt>Aderência ao plano nos últimos {ADHERENCE_WINDOW_DAYS} dias</dt>
          <dd>
            {figures.adherence === null
              ? "Nenhum aluno conectado tem dias de treino definidos."
              : `${Math.round(figures.adherence * 100)}%`}
          </dd>
        </dl>
      </section>

      <section>
        <h2>Sem treinar há {QUIET_AFTER_DAYS} dias ou mais</h2>
        {figures.quiet.length === 0 ? (
          <p>Ninguém.</p>
        ) : (
          <ul>
            {figures.quiet.map(({ student, lastTrained }) => (
              <li key={student.id}>
                {student.name} — {lastTrained === null ? "nunca registrou treino" : `último treino em ${formatDate(lastTrained)}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Avaliações pendentes</h2>
        {figures.pendingAssessments.length === 0 ? (
          <p>Nenhuma.</p>
        ) : (
          <ul>
            {figures.pendingAssessments.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Mensalidades — {formatYearMonth(yearMonth(today))}</h2>
        <dl>
          <dt>Previsto no mês</dt>
          <dd>{formatCents(figures.payments.expectedCents)}</dd>
          <dt>Recebido no mês</dt>
          <dd>{formatCents(figures.payments.receivedCents)}</dd>
          <dt>Em atraso (todos os meses)</dt>
          <dd>{formatCents(figures.payments.overdueCents)}</dd>
        </dl>
        {data.chargesCreated > 0 && <p role="status">{data.chargesCreated} cobrança(s) do mês gerada(s) agora.</p>}
        {figures.payments.overdue.length > 0 && (
          <table>
            <caption>Em atraso</caption>
            <thead>
              <tr>
                <th scope="col">Aluno</th>
                <th scope="col">Vencimento</th>
                <th scope="col">Valor</th>
              </tr>
            </thead>
            <tbody>
              {figures.payments.overdue.map((p) => (
                <tr key={p.id}>
                  <td>{nameOf.get(p.studentId) ?? p.studentId}</td>
                  <td>{formatDate(p.dueDate)}</td>
                  <td>{formatCents(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
