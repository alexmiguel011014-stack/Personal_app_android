"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadStudentAssessments } from "../../../data/assessments";
import { loadStudentBiometrics } from "../../../data/biometrics";
import { getFirebase } from "../../../data/firebase";
import type { Assessment } from "../../../domain/assessments";
import { formatBodyFat, formatKg, type Biometric } from "../../../domain/biometrics";
import { formatDateTime } from "../../../domain/dates";
import { dayMonthLong } from "../../_shared/dateLabels";
import { useSession } from "../../SessionProvider";
import { useTrainerData, type TrainerData } from "../useTrainerData";
import { buildLedger, type LedgerEntry } from "./ledger";

// GOALS.md §23k: the ALLU template's "Registros" — the book of what was actually done, by day:
// sessions the students logged, measurements, self-assessments. What is only planned (the agenda,
// the fichas) is not here. Sessions come with the trainer snapshot; measurements and assessments
// are read per student, as their sections of the student page do.

const DAYS_PER_PAGE = 15;

type Extras = { status: "loading" } | { status: "error" } | { status: "ready"; biometrics: Biometric[]; assessments: Assessment[] };

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

  useEffect(() => {
    let cancelled = false;
    const { db } = getFirebase();
    Promise.all([
      Promise.all(snapshot.students.map((s) => loadStudentBiometrics(db, trainerId, s.id))),
      // A draft has no account, so it has no self-assessments of its own.
      Promise.all(snapshot.students.filter((s) => s.linked).map((s) => loadStudentAssessments(db, trainerId, s.id))),
    ]).then(
      ([biometrics, assessments]) => !cancelled && setExtras({ status: "ready", biometrics: biometrics.flat(), assessments: assessments.flat() }),
      () => !cancelled && setExtras({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, snapshot]);

  const names = new Map([...snapshot.drafts, ...snapshot.linked].map((s) => [s.id, s.name]));
  const days =
    extras.status === "ready"
      ? buildLedger({
          logs: snapshot.logs,
          biometrics: extras.biometrics,
          assessments: extras.assessments,
          timeZone,
          studentId: studentId === "" ? undefined : studentId,
        })
      : // Sessions alone are enough to show something while the rest loads — or if it fails.
        buildLedger({
          logs: snapshot.logs,
          biometrics: [],
          assessments: [],
          timeZone,
          studentId: studentId === "" ? undefined : studentId,
        });
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
      </div>

      {extras.status === "loading" && <p role="status">Carregando medidas e autoavaliações…</p>}
      {extras.status === "error" && (
        <p role="alert">Não foi possível carregar as medidas e autoavaliações; só as sessões estão na lista.</p>
      )}

      {days.length === 0 ? (
        <p>Nenhum registro ainda.</p>
      ) : (
        <>
          {days.slice(0, visibleDays).map((day) => (
            <section className="ledger-day" key={day.date} aria-labelledby={`dia-${day.date}`}>
              <h2 id={`dia-${day.date}`}>{dayMonthLong(day.date)}</h2>
              {day.entries.map((entry) => (
                <Entry key={entry.id} entry={entry} name={names.get(entry.studentId) ?? "Aluno não encontrado"} timeZone={timeZone} />
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
        </>
      )}
    </main>
  );
}

function Entry({ entry, name, timeZone }: { entry: LedgerEntry; name: string; timeZone: string }) {
  const student = (
    <Link href={`/app/alunos/detalhe?id=${encodeURIComponent(entry.studentId)}`}>{name}</Link>
  );
  if (entry.kind === "session") {
    const notes = entry.exercises.filter((exercise) => exercise.note !== null);
    return (
      <article id={entry.id} className="ledger-entry">
        <p>
          <span className="entry-type">Sessão concluída</span> · {student}
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
        <span className="entry-type">Autoavaliação enviada</span> · {student}
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
