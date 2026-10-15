"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebase } from "../../data/firebase";
import { trackActivity, writeTrainerStats } from "../../data/activity";
import { loadTrainerAssessments } from "../../data/assessments";
import { loadSchedules } from "../../data/schedules";
import { ALERT_WINDOW_DAYS, parseOpened, unopenedFlaggedAnamneses, type AnamnesisAlert } from "../../domain/anamnesisAlerts";
import { billingOwners } from "../../domain/billing";
import { barChartLabel, deltaText, progressLabel, sparklineLabel } from "../../domain/chartText";
import { dashboardFigures } from "../../domain/dashboard";
import { addDays, formatDate, formatYearMonth, weekdayOf, yearMonth } from "../../domain/dates";
import { trainedDays } from "../../domain/metrics";
import { formatCents } from "../../domain/payments";
import { AGENDA_DAYS, bookingsOn, type Schedule } from "../../domain/schedules";
import { delta } from "../../domain/series";
import { filterStudentsByPause, type Student } from "../../domain/students";
import { moneyFromPayments, recentSessions, studentHref, trainerAttention, trainerKpis, ADHERENCE_WINDOW_DAYS, SESSIONS_WINDOW_DAYS, SESSION_WINDOWS } from "../../domain/trainerHome";
import { agendaHourNumber, hourIn, longDate, shortDate } from "../_shared/dateLabels";
import { browserStorage } from "../_shared/browserStorage";
import { AttentionList } from "../_shared/dashboard/AttentionList";
import { BarChart, ProgressBar, Sparkline } from "../_shared/dashboard/charts";
import { KpiCard, KpiGrid } from "../_shared/dashboard/KpiCard";
import { useSession } from "../SessionProvider";
import { useTrainerData } from "./useTrainerData";

// GOALS.md §37c: the trainer's home. Top to bottom, what a trainer opens it for: four figures with how they moved,
// who needs them (late mensalidade, gone quiet, assessment waiting, not yet connected), today's agenda, and the
// week's training as bars. The roster, the numbers list and the Mensalidades table moved out — their figures are in
// the cards and the overdue rows in "Precisa de você"; their pages are one tap away. The numbers are §23c's own
// (`dashboardFigures`, `trainerKpis` reuses its definitions), and `writeTrainerStats` still receives exactly what it did.

const RECENT_SESSIONS = 3;

export default function TrainerHome() {
  const { session } = useSession();
  // RequireArea only renders this for a signed-in trainer.
  if (session.status !== "signedIn") return null;
  return <Dashboard trainerId={session.uid} />;
}

function Dashboard({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId, { ensureCharges: true });
  const [schedules, setSchedules] = useState<Schedule[] | "error" | null>(null);
  // GOALS.md §38i: anamneses with a flag the personal has not opened on this device (one small query: the last 30 days).
  const [anamneses, setAnamneses] = useState<AnamnesisAlert[]>([]);
  const loadedAt = data.status === "ready" ? data.now : null;

  useEffect(() => {
    if (data.status !== "ready") return;
    const now = data.now;
    const { db } = getFirebase();
    const key = `trainer-login:${trainerId}`;
    try {
      if (window.sessionStorage.getItem(key) !== "1") {
        window.sessionStorage.setItem(key, "1");
        void trackActivity(db, trainerId, "login", now, data.timeZone);
      }
    } catch {
      // Session storage can be unavailable in a restricted browser; summary tracking still works.
    }
    const figures = dashboardFigures(data.snapshot, data.today, data.timeZone);
    void writeTrainerStats(db, trainerId, figures, data.snapshot, now, data.timeZone).catch(() => {});
  }, [data, trainerId]);

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

  useEffect(() => {
    if (loadedAt === null) return;
    let cancelled = false;
    loadTrainerAssessments(getFirebase().db, trainerId, loadedAt - ALERT_WINDOW_DAYS * 86_400_000).then(
      (assessments) => {
        if (cancelled) return;
        let raw: string | null = null;
        try {
          raw = browserStorage()?.getItem(`anamnesis-opened:${trainerId}`) ?? null;
        } catch {
          raw = null;
        }
        setAnamneses(unopenedFlaggedAnamneses(assessments, new Set(parseOpened(raw)), loadedAt));
      },
      () => {
        // An extra: "Hoje" opens without it.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [loadedAt, trainerId]);

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
  const kpis = trainerKpis({ students: snapshot.students, logs: snapshot.logs }, today, timeZone);
  const activeStudents = filterStudentsByPause(snapshot.students);
  const pausedStudentIds = new Set(snapshot.students.filter((student) => student.paused).map((student) => student.id));
  const activeSchedules = schedules === null || schedules === "error"
    ? schedules
    : schedules.filter((schedule) => !pausedStudentIds.has(schedule.studentId));
  const activeLogs = snapshot.logs.filter((log) => !pausedStudentIds.has(log.studentId));
  // A charge can sit under the id of a draft the student has since claimed (domain/billing.ts).
  const owners = billingOwners(snapshot.students, snapshot.claimedDraftByAccount);
  const money = moneyFromPayments(figures.payments, owners);
  const attention = trainerAttention(
    {
      students: snapshot.students,
      money,
      quiet: figures.quiet,
      pendingAssessments: figures.pendingAssessments,
      feedback: snapshot.feedback,
      anamneses: anamneses.filter((alert) => snapshot.linked.some((linked) => linked.id === alert.studentId)),
    },
    today,
    timeZone,
  );

  const todayName = weekdayOf(today);
  const todayBookings =
    activeSchedules === null || activeSchedules === "error"
      ? []
      : activeSchedules
          .filter((schedule) => schedule.dayOfWeek === todayName)
          .sort((a, b) => agendaHourNumber(a.hour) - agendaHourNumber(b.hour));
  const summary =
    activeSchedules === null || activeSchedules === "error"
      ? "O ritmo da sua semana e dos seus alunos."
      : todayBookings.length === 0
        ? "Nenhum horário agendado para hoje."
        : `${todayBookings.length} ${todayBookings.length === 1 ? "horário agendado" : "horários agendados"} para hoje.`;

  const trained = trainedDays(activeLogs, timeZone);
  const names = new Map([...snapshot.drafts, ...snapshot.linked].map((s) => [s.id, s.name]));

  const sessionWindows = kpis.sessions.windows;
  const weeklyValues = sessionWindows.map((window) => window.count);
  const adherencePercent = kpis.adherence.current === null ? null : Math.round(kpis.adherence.current * 100);
  const adherenceChange =
    kpis.adherence.current !== null && kpis.adherence.previous !== null
      ? delta(adherencePercent ?? 0, Math.round(kpis.adherence.previous * 100))
      : null;
  const sessions = recentSessions(activeLogs, timeZone, RECENT_SESSIONS);

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

      <KpiGrid label="Resumo da semana">
        <KpiCard
          label="Treinos na semana"
          href="/app/registros"
          value={kpis.sessions.current}
          change={{
            text: deltaText(kpis.sessions.delta, `${SESSIONS_WINDOW_DAYS} dias antes`),
            tone: kpis.sessions.delta.direction === "up" ? "good" : kpis.sessions.delta.direction === "down" ? "bad" : "neutral",
          }}
          sub={`Últimos ${SESSIONS_WINDOW_DAYS} dias`}
        >
          <Sparkline label={sparklineLabel(`Treinos a cada ${SESSIONS_WINDOW_DAYS} dias, últimas ${SESSION_WINDOWS} semanas`, weeklyValues)} values={weeklyValues} />
        </KpiCard>

        <KpiCard
          label="Aderência ao plano"
          href="/app/alunos"
          value={adherencePercent === null ? "—" : `${adherencePercent}%`}
          change={
            adherenceChange
              ? { text: deltaText(adherenceChange, `${ADHERENCE_WINDOW_DAYS} dias antes`, " pp"), tone: adherenceChange.direction === "up" ? "good" : adherenceChange.direction === "down" ? "bad" : "neutral" }
              : undefined
          }
          sub={adherencePercent === null ? "Nenhum aluno conectado tem dias de treino definidos." : `Últimos ${ADHERENCE_WINDOW_DAYS} dias`}
        >
          {adherencePercent !== null && (
            <ProgressBar part={adherencePercent} total={100} label={`Aderência: ${adherencePercent}% do plano nos últimos ${ADHERENCE_WINDOW_DAYS} dias.`} />
          )}
        </KpiCard>

        <KpiCard
          label="Alunos"
          href="/app/alunos"
          value={kpis.students.total}
          sub={`${kpis.students.linked} conectados · ${kpis.students.pending} aguardando conexão`}
        />

        <KpiCard
          label={`Mensalidades — ${formatYearMonth(yearMonth(today))}`}
          href="/app/mensalidades"
          value={
            <>
              {formatCents(money.receivedCents)}
              <small>de {formatCents(money.expectedCents)}</small>
            </>
          }
          sub={money.overdueCents > 0 ? `${formatCents(money.overdueCents)} em atraso` : "Nenhuma em atraso"}
        >
          <ProgressBar part={money.receivedCents} total={money.expectedCents} label={`Recebido no mês: ${progressLabel(money.receivedCents, money.expectedCents, formatCents)}`} />
        </KpiCard>
      </KpiGrid>

      <div className="home-grid">
        <AttentionList
          id="attention-title"
          title="Precisa de você"
          items={attention}
          empty={snapshot.students.length === 0 ? "Nenhum aluno ainda. Comece em “Cadastrar aluno”." : "Tudo em dia por aqui."}
        />

        <section className="panel agenda-section" aria-labelledby="agenda-title">
          <div className="section-heading">
            <h2 id="agenda-title">Agenda de hoje</h2>
            <span className="quiet-count">
              {todayBookings.length} {todayBookings.length === 1 ? "horário" : "horários"}
            </span>
          </div>
          <WeekRow today={today} schedules={activeSchedules} />
          <DayAgenda
            schedules={activeSchedules}
            bookings={todayBookings}
            students={activeStudents}
            names={names}
            trainedToday={(studentId) => trained.get(studentId)?.has(today) ?? false}
            nowHour={hourIn(data.now, timeZone)}
          />
          <p className="section-footnote">
            Horários são agendamentos fixos da semana, não sessões concluídas. <Link href="/app/agenda">Ver agenda completa</Link>
          </p>
        </section>
      </div>

      <section className="panel" aria-labelledby="activity-title">
        <div className="section-heading">
          <h2 id="activity-title">Treinos por semana</h2>
          <span className="quiet-count">Cada barra: 7 dias até a data</span>
        </div>
        <BarChart
          label={barChartLabel(
            `Treinos a cada ${SESSIONS_WINDOW_DAYS} dias, até a data indicada`,
            sessionWindows.map((window) => ({ label: shortDate(window.to), value: window.count })),
          )}
          bars={sessionWindows.map((window) => ({ key: window.to, label: shortDate(window.to), value: window.count, valueLabel: String(window.count) }))}
        />
        <h3 className="records-title">Últimos treinos registrados</h3>
        {sessions.length === 0 ? (
          <p className="section-footnote">Nenhum treino registrado ainda.</p>
        ) : (
          <ul className="records-list">
            {sessions.map((session) => (
              <li key={`${session.studentId}-${session.day}`}>
                <Link href={studentHref(session.studentId)}>{names.get(session.studentId) ?? "Aluno"}</Link>
                <span>
                  {formatDate(session.day)} · {session.exercises} {session.exercises === 1 ? "exercício registrado" : "exercícios registrados"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/app/registros">Abrir livro de registros</Link>
        </p>
      </section>

      {data.chargesCreated > 0 && (
        <p className="section-footnote" role="status">
          {data.chargesCreated} cobrança(s) do mês gerada(s) agora.
        </p>
      )}
    </main>
  );
}

/** This week, Monday to Sunday, one row: the day, the date and how many fixed horários it has. */
function WeekRow({ today, schedules }: { today: string; schedules: Schedule[] | "error" | null }) {
  const todayIndex = AGENDA_DAYS.indexOf(weekdayOf(today));
  const monday = addDays(today, -todayIndex);
  return (
    <div className="week-row" role="list" aria-label="Semana atual">
      {AGENDA_DAYS.map((day, index) => {
        const date = addDays(monday, index);
        const count = Array.isArray(schedules) ? bookingsOn(schedules, day) : null;
        return (
          <div
            key={day}
            role="listitem"
            className={`day${index === todayIndex ? " today" : ""}`}
            aria-current={index === todayIndex ? "date" : undefined}
            aria-label={`${day}, ${date.slice(8)}: ${count === null ? "horários indisponíveis" : count === 0 ? "livre" : `${count} ${count === 1 ? "horário" : "horários"}`}`}
          >
            <span aria-hidden="true">{day.slice(0, 3)}</span>
            <strong aria-hidden="true">{date.slice(8)}</strong>
            <small aria-hidden="true">{count === null ? "—" : count === 0 ? "Livre" : count}</small>
          </div>
        );
      })}
    </div>
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
                <Link href={studentHref(booking.studentId)}>{names.get(booking.studentId) ?? "Aluno não encontrado"}</Link>
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
