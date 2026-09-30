"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebase } from "../../data/firebase";
import { loadSchedules } from "../../data/schedules";
import { billingOwners } from "../../domain/billing";
import { dashboardFigures, ADHERENCE_WINDOW_DAYS, QUIET_AFTER_DAYS, SESSIONS_WINDOW_DAYS } from "../../domain/dashboard";
import { addDays, formatDate, formatYearMonth, localDate, weekdayOf, yearMonth } from "../../domain/dates";
import { decodePerformedSets } from "../../domain/exercise";
import { trainedDays } from "../../domain/metrics";
import { formatCents } from "../../domain/payments";
import { formatSets, recentLogs } from "../../domain/progression";
import { AGENDA_DAYS, bookingsOn, type Schedule } from "../../domain/schedules";
import type { Student } from "../../domain/students";
import { Avatar } from "../_shared/Avatar";
import { agendaHourNumber, hourIn, longDate, shortDate } from "../_shared/dateLabels";
import { useSession } from "../SessionProvider";
import { useTrainerData } from "./useTrainerData";

// GOALS.md §23g/§23k: the trainer's home, laid out as the ALLU template's "Hoje" — the week as a
// strip, the day's agenda as a timeline, the roster beside it — with §23c's numbers (sessions,
// adherence, who went quiet, pending assessments, mensalidades) kept and moved below, in the
// template's quiet lists instead of a wall of metric cards.

const ROSTER_SHOWN = 5;

const studentUrl = (id: string) => `/app/alunos/detalhe?id=${encodeURIComponent(id)}`;

export default function TrainerHome() {
  const { session } = useSession();
  // RequireArea only renders this for a signed-in trainer.
  if (session.status !== "signedIn") return null;
  return <Dashboard trainerId={session.uid} />;
}

function Dashboard({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId, { ensureCharges: true });
  const [schedules, setSchedules] = useState<Schedule[] | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSchedules(getFirebase().db, trainerId).then(
      (loaded) => !cancelled && setSchedules(loaded),
      () => !cancelled && setSchedules("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId]);

  if (data.status === "loading") return <p className="loading">Carregando…</p>;
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

  const { today, timeZone, snapshot } = data;
  const figures = dashboardFigures(snapshot, today, timeZone);
  // A charge can sit under the id of a draft the student has since claimed (domain/billing.ts).
  const owners = billingOwners(snapshot.students, snapshot.claimedDraftByAccount);

  const todayName = weekdayOf(today);
  const todayBookings =
    schedules === null || schedules === "error"
      ? []
      : schedules
          .filter((schedule) => schedule.dayOfWeek === todayName)
          .sort((a, b) => agendaHourNumber(a.hour) - agendaHourNumber(b.hour));
  const summary =
    schedules === null || schedules === "error"
      ? "O ritmo da sua semana e dos seus alunos."
      : todayBookings.length === 0
        ? "Nenhum horário agendado para hoje."
        : `${todayBookings.length} ${todayBookings.length === 1 ? "horário agendado" : "horários agendados"} para hoje.`;

  const trained = trainedDays(snapshot.logs, timeZone);
  const latest = recentLogs(snapshot.logs, 1)[0];
  const latestStudent = latest ? snapshot.students.find((s) => s.id === latest.studentId) : undefined;

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Hoje</h1>
          <p className="header-subtitle">
            {longDate(today)} · {summary}
          </p>
        </div>
        <div className="page-actions">
          <Link className="button button-primary" href="/app/alunos/novo">
            Cadastrar aluno
          </Link>
        </div>
      </header>

      {data.chargesCreated > 0 && <p role="status">{data.chargesCreated} cobrança(s) do mês gerada(s) agora.</p>}

      <WeekStrip today={today} schedules={schedules} />

      <div className="work-grid">
        <section className="agenda-section" aria-labelledby="agenda-title">
          <div className="section-heading agenda-heading">
            <h2 id="agenda-title">Agenda do dia</h2>
            <span className="quiet-count">
              {todayBookings.length} {todayBookings.length === 1 ? "horário" : "horários"}
            </span>
          </div>
          <DayAgenda
            schedules={schedules}
            bookings={todayBookings}
            students={snapshot.students}
            names={new Map([...snapshot.drafts, ...snapshot.linked].map((s) => [s.id, s.name]))}
            trainedToday={(studentId) => trained.get(studentId)?.has(today) ?? false}
            nowHour={hourIn(data.now, timeZone)}
          />
          <p className="section-footnote">
            Horários são agendamentos fixos da semana, não sessões concluídas. <Link href="/app/agenda">Ver agenda completa</Link>
          </p>
        </section>

        <section className="roster-section" aria-labelledby="roster-title">
          <div className="section-heading roster-heading">
            <h2 id="roster-title">Seus alunos</h2>
            <span className="quiet-count">{figures.students.total} no total</span>
          </div>
          <Roster students={snapshot.students} />
          {latest && (
            <section className="record-note" aria-labelledby="record-title">
              <h3 id="record-title">Último registro{latestStudent ? ` · ${latestStudent.name}` : ""}</h3>
              <p>
                {formatDate(localDate(latest.date, timeZone))} · {latest.exerciseName}
              </p>
              <p>{formatSets(decodePerformedSets(latest.performedSetsJson)) || "Sem séries anotadas."}</p>
              <p>
                <Link href="/app/registros">Abrir livro de registros</Link>
              </p>
            </section>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="attention-title">
        <h2 id="attention-title">Atenção</h2>
        <div className="attention-grid">
          <div>
            <h3>Sem treinar há {QUIET_AFTER_DAYS} dias ou mais</h3>
            {figures.quiet.length === 0 ? (
              <p>Ninguém.</p>
            ) : (
              <ul>
                {figures.quiet.map(({ student, lastTrained }) => (
                  <li key={student.id}>
                    <Link href={studentUrl(student.id)}>{student.name}</Link> —{" "}
                    {lastTrained === null ? "nunca registrou treino" : `último treino em ${formatDate(lastTrained)}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Avaliações pendentes</h3>
            {figures.pendingAssessments.length === 0 ? (
              <p>Nenhuma.</p>
            ) : (
              <ul>
                {figures.pendingAssessments.map((s) => (
                  <li key={s.id}>
                    <Link href={studentUrl(s.id)}>{s.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="panel" aria-labelledby="numbers-title">
        <h2 id="numbers-title">A semana em números</h2>
        <dl className="figures">
          <div>
            <dt>Alunos</dt>
            <dd>
              {figures.students.total}
              <small>
                {figures.students.linked} conectados · {figures.students.pending} aguardando conexão
              </small>
            </dd>
          </div>
          <div>
            <dt>Sessões nos últimos {SESSIONS_WINDOW_DAYS} dias</dt>
            <dd>{figures.sessions}</dd>
          </div>
          <div>
            <dt>Aderência ao plano nos últimos {ADHERENCE_WINDOW_DAYS} dias</dt>
            <dd>
              {figures.adherence === null ? "—" : `${Math.round(figures.adherence * 100)}%`}
              {figures.adherence === null && <small>Nenhum aluno conectado tem dias de treino definidos.</small>}
            </dd>
          </div>
        </dl>
        <p>
          <Link href="/app/alunos">Ver todos os alunos</Link>
        </p>
      </section>

      <section className="panel" aria-labelledby="payments-title">
        <h2 id="payments-title">Mensalidades — {formatYearMonth(yearMonth(today))}</h2>
        <dl className="figures">
          <div>
            <dt>Previsto no mês</dt>
            <dd>{formatCents(figures.payments.expectedCents)}</dd>
          </div>
          <div>
            <dt>Recebido no mês</dt>
            <dd>{formatCents(figures.payments.receivedCents)}</dd>
          </div>
          <div>
            <dt>Em atraso (todos os meses)</dt>
            <dd>{formatCents(figures.payments.overdueCents)}</dd>
          </div>
        </dl>
        {figures.payments.overdue.length > 0 && (
          <table className="stack">
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
                  <td data-label="Aluno">{owners.get(p.studentId)?.name ?? p.studentId}</td>
                  <td data-label="Vencimento">{formatDate(p.dueDate)}</td>
                  <td data-label="Valor">{formatCents(p.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          <Link href="/app/mensalidades">Gerenciar mensalidades</Link>
        </p>
      </section>
    </main>
  );
}

/** The template's "Ritmo da semana": Monday to Sunday of this week, today highlighted. */
function WeekStrip({ today, schedules }: { today: string; schedules: Schedule[] | "error" | null }) {
  const todayIndex = AGENDA_DAYS.indexOf(weekdayOf(today));
  const monday = addDays(today, -todayIndex);
  const sunday = addDays(monday, 6);
  return (
    <section className="week-section" aria-labelledby="week-title">
      <div className="section-heading week-heading">
        <div>
          <h2 id="week-title">Ritmo da semana</h2>
          <p className="section-footnote">Horários fixos por dia da semana</p>
        </div>
        <p className="week-range">
          {shortDate(monday)} — {shortDate(sunday)}
        </p>
      </div>
      <div className="week-strip" role="list" aria-label="Semana atual">
        {AGENDA_DAYS.map((day, index) => {
          const date = addDays(monday, index);
          const count = Array.isArray(schedules) ? bookingsOn(schedules, day) : null;
          return (
            <div
              key={day}
              role="listitem"
              className={`day-cell${index === todayIndex ? " selected" : ""}`}
              aria-current={index === todayIndex ? "date" : undefined}
            >
              <span>{day.slice(0, 3)}</span>
              <strong>{date.slice(8)}</strong>
              <small>{count === null ? "—" : count === 0 ? "Livre" : `${count} ${count === 1 ? "horário" : "horários"}`}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The template's timeline: today's bookings by hour, the next one marked. */
function DayAgenda({
  schedules,
  bookings,
  students,
  names,
  trainedToday,
  nowHour,
}: {
  schedules: Schedule[] | "error" | null;
  bookings: Schedule[];
  students: readonly Student[];
  names: ReadonlyMap<string, string>;
  trainedToday: (studentId: string) => boolean;
  nowHour: number;
}) {
  if (schedules === null) return <p className="section-footnote">Carregando a agenda…</p>;
  if (schedules === "error") return <p role="alert">Não foi possível carregar a agenda.</p>;
  if (bookings.length === 0) return <p className="section-footnote">Nenhum horário agendado para hoje.</p>;

  const nextId = bookings.find((b) => !trainedToday(b.studentId) && agendaHourNumber(b.hour) >= nowHour)?.id;
  return (
    <div className="agenda-list">
      {bookings.map((booking) => {
        const student = students.find((s) => s.id === booking.studentId);
        const hour = agendaHourNumber(booking.hour);
        const done = trainedToday(booking.studentId);
        const isNext = booking.id === nextId;
        const status = done ? "Registrado" : isNext ? "A seguir" : hour >= nowHour ? "Agendado" : "Sem registro";
        return (
          <article key={booking.id} className={`session-row${isNext ? " current-session" : ""}`}>
            <time className="session-time" dateTime={`${String(hour).padStart(2, "0")}:00`}>
              {String(hour).padStart(2, "0")}:00
            </time>
            <span className="timeline-mark" aria-hidden="true" />
            <div className="session-main">
              {student?.goal && <p className="session-type">{student.goal}</p>}
              <h3>
                <Link href={studentUrl(booking.studentId)}>{names.get(booking.studentId) ?? "Aluno não encontrado"}</Link>
              </h3>
              <p className="session-meta">{student ? (student.linked ? "Conectado" : "Aguardando conexão") : "Cadastro antigo"}</p>
            </div>
            <span className={`session-status${isNext ? " status-now" : done ? " status-done" : ""}`}>{status}</span>
          </article>
        );
      })}
    </div>
  );
}

function Roster({ students }: { students: readonly Student[] }) {
  if (students.length === 0) {
    return (
      <p className="section-footnote">
        Nenhum aluno ainda. <Link href="/app/alunos/novo">Cadastrar o primeiro aluno</Link>
      </p>
    );
  }
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const row = (student: Student) => (
    <article className="student-row" key={student.id}>
      <Avatar name={student.name} />
      <div className="student-main">
        <h3>
          <Link href={studentUrl(student.id)}>{student.name}</Link>
        </h3>
        <p>
          {student.goal || "Sem objetivo"} · {student.linked ? "Conectado" : "Aguardando conexão"}
        </p>
      </div>
    </article>
  );
  const rest = sorted.slice(ROSTER_SHOWN);
  return (
    <div className="roster-list">
      {sorted.slice(0, ROSTER_SHOWN).map(row)}
      {rest.length > 0 && (
        <details className="more-students">
          <summary>
            Mais {rest.length} {rest.length === 1 ? "aluno" : "alunos"} <span aria-hidden="true">+</span>
          </summary>
          {rest.map(row)}
        </details>
      )}
      <p className="section-footnote">
        <Link href="/app/alunos">Ver diretório de {students.length} alunos</Link>
      </p>
    </div>
  );
}
