"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadTrainerAssessments } from "../../../data/assessments";
import { loadTrainerBiometrics } from "../../../data/biometrics";
import { loadTrainerFeedback } from "../../../data/sessionFeedback";
import { getFirebase } from "../../../data/firebase";
import { loadTrainerLogs } from "../../../data/trainerData";
import { loadTrainerWorkouts } from "../../../data/workouts";
import type { Assessment } from "../../../domain/assessments";
import { formatBodyFat, formatKg, type Biometric } from "../../../domain/biometrics";
import { formatDate, formatDateTime, localDate } from "../../../domain/dates";
import type { WorkoutLogDoc } from "../../../domain/metrics";
import { DAY_MS, TRAINER_LOG_WINDOW_DAYS } from "../../../domain/readWindows";
import { feedbackKey, indexFeedback, isUnseenByTrainer, type SessionFeedback } from "../../../domain/sessionFeedback";
import { sessionTitle } from "../../../domain/sessions";
import { dayMonthLong } from "../../_shared/dateLabels";
import { useSession } from "../../SessionProvider";
import { FeedbackPanel } from "../FeedbackPanel";
import { useTrainerData, useTrainerDataInvalidation, type TrainerData } from "../useTrainerData";
import { buildLedger, type LedgerEntry } from "./ledger";

// GOALS.md §23k: the ALLU template's "Registros" — the book of what was actually done, by day:
// sessions the students logged, measurements, self-assessments. What is only planned (the agenda,
// the fichas) is not here. Sessions come with the trainer snapshot; measurements and assessments
// are read for the same window (GOALS.md §38b: one query each for the whole roster, not two per
// aluno), and "Buscar registros antes de…" goes back one window at a time.

const DAYS_PER_PAGE = 15;

type Extras = { status: "loading" } | { status: "error" } | { status: "ready"; biometrics: Biometric[]; assessments: Assessment[]; feedback: SessionFeedback[] };

/** What "Buscar registros antes de…" has added, from `from` up to the snapshot's window. */
interface Older {
  from: number;
  logs: WorkoutLogDoc[];
  biometrics: Biometric[];
  assessments: Assessment[];
  feedback: SessionFeedback[];
}

export default function LedgerPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Ledger trainerId={session.uid} />;
}

function Ledger({ trainerId }: { trainerId: string }) {
  const { data, reload } = useTrainerData(trainerId);
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
  return <Book trainerId={trainerId} data={data} />;
}

function Book({ trainerId, data }: { trainerId: string; data: Extract<TrainerData, { status: "ready" }> }) {
  const { snapshot, timeZone } = data;
  const [extras, setExtras] = useState<Extras>({ status: "loading" });
  const [studentId, setStudentId] = useState("");
  const [visibleDays, setVisibleDays] = useState(DAYS_PER_PAGE);
  const [older, setOlder] = useState<Older>({ from: snapshot.logsFrom, logs: [], biometrics: [], assessments: [], feedback: [] });
  // GOALS.md §38h/§38i: what the personal has just written (marked seen, commented), over what was read; and the filter.
  const [edits, setEdits] = useState<ReadonlyMap<string, SessionFeedback>>(new Map());
  const [onlyUnseen, setOnlyUnseen] = useState(false);
  const invalidate = useTrainerDataInvalidation();
  const [olderStatus, setOlderStatus] = useState<"idle" | "loading" | "error">("idle");
  // GOALS.md §38c (U10): the treino a session was done under, by name. A failed read just leaves the names out.
  const [workoutNames, setWorkoutNames] = useState<ReadonlyMap<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTrainerWorkouts(getFirebase().db, trainerId).then(
      (workouts) => !cancelled && setWorkoutNames(new Map(workouts.map((workout) => [workout.id, workout.name]))),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId]);

  useEffect(() => {
    let cancelled = false;
    const { db } = getFirebase();
    // The feedback is an extra: where the Rules that carry it are not published yet, the rest of the book still opens.
    Promise.all([
      loadTrainerBiometrics(db, trainerId, snapshot.logsFrom),
      loadTrainerAssessments(db, trainerId, snapshot.logsFrom),
      loadTrainerFeedback(db, trainerId, localDate(snapshot.logsFrom, timeZone)).catch(() => []),
    ]).then(
      ([biometrics, assessments, feedback]) => !cancelled && setExtras({ status: "ready", biometrics, assessments, feedback }),
      () => !cancelled && setExtras({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, snapshot, timeZone]);

  // Nobody has anything from before the first aluno joined: no need to look further back than that.
  const earliest = Math.min(...snapshot.students.map((s) => s.createdAt));
  const canLoadOlder = older.from > earliest;

  async function loadOlder() {
    const to = older.from;
    const from = to - TRAINER_LOG_WINDOW_DAYS * DAY_MS;
    setOlderStatus("loading");
    try {
      const { db } = getFirebase();
      const [logs, biometrics, assessments, feedback] = await Promise.all([
        loadTrainerLogs(db, trainerId, from, to),
        loadTrainerBiometrics(db, trainerId, from, to),
        loadTrainerAssessments(db, trainerId, from, to),
        loadTrainerFeedback(db, trainerId, localDate(from, timeZone), localDate(to, timeZone)).catch(() => []),
      ]);
      setOlder((previous) => ({
        from,
        logs: [...previous.logs, ...logs],
        biometrics: [...previous.biometrics, ...biometrics],
        assessments: [...previous.assessments, ...assessments],
        feedback: [...previous.feedback, ...feedback],
      }));
      setVisibleDays((n) => n + DAYS_PER_PAGE);
      setOlderStatus("idle");
    } catch {
      setOlderStatus("error");
    }
  }

  const names = new Map([...snapshot.drafts, ...snapshot.linked].map((s) => [s.id, s.name]));
  // The page always read the measurements and assessments of the alunos on the list — the trainer-wide queries
  // also return those of alunos no longer there, which stay out.
  const listed = new Set(snapshot.students.map((s) => s.id));
  // Sessions alone are enough to show something while the rest loads — or if it fails.
  const feedbackByKey = indexFeedback(extras.status === "ready" ? [...extras.feedback, ...older.feedback] : []);
  for (const [key, edited] of edits) feedbackByKey.set(key, edited);
  const allDays = buildLedger({
    logs: [...snapshot.logs, ...older.logs],
    biometrics: extras.status === "ready" ? [...extras.biometrics, ...older.biometrics].filter((b) => listed.has(b.studentId)) : [],
    assessments: extras.status === "ready" ? [...extras.assessments, ...older.assessments].filter((a) => listed.has(a.studentId)) : [],
    timeZone,
    studentId: studentId === "" ? undefined : studentId,
  });
  // "Só não vistas": the sessions the aluno said something about that the personal has not marked as seen.
  const days = onlyUnseen
    ? allDays
        .map((day) => ({
          ...day,
          entries: day.entries.filter((entry) => {
            if (entry.kind !== "session") return false;
            const item = feedbackByKey.get(feedbackKey(entry.studentId, entry.day));
            return item !== undefined && isUnseenByTrainer(item);
          }),
        }))
        .filter((day) => day.entries.length > 0)
    : allDays;
  const loadOlderButton = canLoadOlder && (
    <p>
      <button type="button" disabled={olderStatus === "loading"} onClick={() => void loadOlder()}>
        {olderStatus === "loading" ? "Buscando dias anteriores…" : `Buscar registros antes de ${formatDate(localDate(older.from, timeZone))}`}
      </button>
      {olderStatus === "error" && <span role="alert"> Não foi possível buscar. Tente de novo.</span>}
    </p>
  );
  const sorted = [...snapshot.students].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Registros</h1>
          <p className="header-subtitle">Livro cronológico de atividade realizada: sessões, medidas e autoavaliações.</p>
        </div>
      </header>

      <aside className="ledger-note">
        <strong>O que entra neste livro?</strong> Só o que já aconteceu. Horários futuros ficam na{" "}
        <Link href="/app/agenda">Agenda</Link>; os planos de treino ficam na página de cada <Link href="/app/alunos">aluno</Link>.
      </aside>

      <div className="filters">
        <label>
          Aluno
          <select
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setVisibleDays(DAYS_PER_PAGE);
            }}
          >
            <option value="">Todos os alunos</option>
            {sorted.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <label className="check-line">
          <input type="checkbox" checked={onlyUnseen} onChange={(event) => { setOnlyUnseen(event.target.checked); setVisibleDays(DAYS_PER_PAGE); }} />
          Só não vistas
        </label>
      </div>

      {extras.status === "loading" && <p role="status">Carregando medidas e autoavaliações…</p>}
      {extras.status === "error" && (
        <p role="alert">Não foi possível carregar as medidas e autoavaliações; só as sessões estão na lista.</p>
      )}

      {days.length === 0 ? (
        <>
          <p>{canLoadOlder ? `Nenhum registro desde ${formatDate(localDate(older.from, timeZone))}.` : "Nenhum registro ainda."}</p>
          {loadOlderButton}
        </>
      ) : (
        <>
          {days.slice(0, visibleDays).map((day) => (
            <section className="ledger-day" key={day.date} aria-labelledby={`dia-${day.date}`}>
              <h2 id={`dia-${day.date}`}>{dayMonthLong(day.date)}</h2>
              {day.entries.map((entry) => (
                <Entry
                  key={entry.id}
                  entry={entry}
                  name={names.get(entry.studentId) ?? "Aluno não encontrado"}
                  timeZone={timeZone}
                  workoutNames={workoutNames}
                  trainerId={trainerId}
                  feedback={entry.kind === "session" ? feedbackByKey.get(feedbackKey(entry.studentId, entry.day)) : undefined}
                  onFeedback={(next) => {
                    setEdits((previous) => new Map(previous).set(feedbackKey(next.studentId, next.day), next));
                    invalidate();
                  }}
                />
              ))}
            </section>
          ))}
          {days.length > visibleDays && (
            <p>
              <button type="button" onClick={() => setVisibleDays((n) => n + DAYS_PER_PAGE)}>
                Mostrar dias anteriores
              </button>
            </p>
          )}
          {days.length <= visibleDays && loadOlderButton}
        </>
      )}
    </main>
  );
}

function Entry({
  entry,
  name,
  timeZone,
  workoutNames,
  trainerId,
  feedback,
  onFeedback,
}: {
  entry: LedgerEntry;
  name: string;
  timeZone: string;
  workoutNames: ReadonlyMap<string, string> | null;
  trainerId: string;
  feedback: SessionFeedback | undefined;
  onFeedback: (next: SessionFeedback) => void;
}) {
  const student = (
    <Link href={`/app/alunos/detalhe?id=${encodeURIComponent(entry.studentId)}`}>{name}</Link>
  );
  if (entry.kind === "session") {
    const notes = entry.exercises.filter((exercise) => exercise.note !== null);
    return (
      <article id={entry.id} className="ledger-entry">
        <p>
          <span className="entry-type">Sessão concluída</span> · {student}
          {workoutNames !== null && ` · ${sessionTitle(entry, workoutNames)}`}
        </p>
        <ul>
          {entry.exercises.map((exercise, index) => (
            <li key={index}>
              {exercise.name}
              {exercise.sets ? ` · ${exercise.sets}` : ""}
            </li>
          ))}
        </ul>
        {notes.length > 0 && (
          <details>
            <summary>Nota registrada</summary>
            {notes.map((exercise, index) => (
              <p key={index}>
                {exercise.name}: {exercise.note}
              </p>
            ))}
          </details>
        )}
        <FeedbackPanel trainerId={trainerId} studentId={entry.studentId} day={entry.day} feedback={feedback} onChange={onFeedback} />
      </article>
    );
  }
  if (entry.kind === "measurement") {
    return (
      <article id={entry.id} className="ledger-entry">
        <p>
          <span className="entry-type">Nova medida</span> · {student}
        </p>
        <p>
          peso: {formatKg(entry.weight)}
          {entry.bodyFat > 0 ? ` · gordura: ${formatBodyFat(entry.bodyFat)}` : " · percentual de gordura não informado"}
        </p>
      </article>
    );
  }
  return (
    <article id={entry.id} className="ledger-entry">
      <p>
        <span className="entry-type">{entry.anamnesis ? "Anamnese enviada" : "Autoavaliação enviada"}</span> · {student}
      </p>
      <p>
        {formatDateTime(entry.ms, timeZone)} ·{" "}
        {entry.flagged === 0 ? (
          "PAR-Q+: nenhuma resposta “sim”."
        ) : (
          <strong>
            PAR-Q+: {entry.flagged} {entry.flagged === 1 ? "resposta" : "respostas"} “sim” — avalie antes de prescrever.
          </strong>
        )}
      </p>
    </article>
  );
}
