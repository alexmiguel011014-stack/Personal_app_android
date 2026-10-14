"use client";

import Link from "next/link";
import { summarizeExercise } from "../../domain/exerciseDetails";
import { groupFichas } from "../../domain/fichas";
import { trainedDays } from "../../domain/metrics";
import { nextTreino } from "../../domain/nextTreino";
import { scheduleLines } from "../../domain/schedules";
import { weekSummary, weekSummaryText } from "../../domain/weekSummary";
import { ExerciseNote } from "../_shared/ExerciseNote";
import { useSession } from "../SessionProvider";
import { useStudentData } from "./useStudentData";

// GOALS.md §23h/§34: the student's home — StudentWorkoutsScreen: the fichas their trainer assigned, newest first,
// each under its name with its treinos (exercises and "Registrar treino de hoje"), plus the pending-assessment
// banner the phone shows when the trainer has asked for one.

export default function StudentHome() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Home uid={session.uid} />;
}

function Home({ uid }: { uid: string }) {
  const { data, reload } = useStudentData(uid);

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

  const { profile, workouts, logs, schedules, timeZone, today } = data;
  const fichas = groupFichas(workouts);
  // GOALS.md §38f: all three come from what is already in memory (the logs of the last 60 days and the aluno's appointments).
  const next = nextTreino(fichas, logs);
  const week = weekSummary(trainedDays(logs, timeZone).get(uid) ?? new Set<string>(), today);
  const appointments = scheduleLines(schedules);
  return (
    <main>
      <h1>Minhas fichas</h1>
      <p>Olá, {profile.name.split(" ")[0]}!</p>

      {profile.pendingAssessmentRequest && profile.canSelfAssess && (
        <section>
          <h2>Anamnese pendente</h2>
          <p>Seu personal pediu sua anamnese — leva uns 5 minutos, em toques.</p>
          <p>
            <Link href="/aluno/avaliacao">Responder agora</Link>
          </p>
        </section>
      )}

      {next && (
        <section className="next-treino">
          <h2>Próximo treino</h2>
          <h3>{next.treino.name}</h3>
          <p>
            {next.ficha.name} · {next.treino.exercises.length} {next.treino.exercises.length === 1 ? "exercício" : "exercícios"}
            {next.after !== null && next.after.id !== next.treino.id && ` · depois do ${next.after.name}`}
          </p>
          <Link className="button button-primary" href={`/aluno/treino?ficha=${encodeURIComponent(next.treino.id)}`}>
            Começar
          </Link>
        </section>
      )}

      {workouts.length > 0 && (
        <section className="week">
          <h2>Esta semana</h2>
          <ol className="week-dots">
            {week.days.map((day) => (
              <li key={day.date} data-state={day.state}>
                <span className="dot" aria-hidden="true">
                  {day.state === "done" ? "✓" : ""}
                </span>
                <span className="day-label">{day.label}</span>
                <span className="visually-hidden">
                  {day.state === "done" ? ": treinou" : day.state === "today" ? ": hoje" : day.state === "missed" ? ": não treinou" : ""}
                </span>
              </li>
            ))}
          </ol>
          <p>{weekSummaryText(week)}</p>
        </section>
      )}

      {appointments.length > 0 && (
        <section className="appointments">
          <h2>Meus horários</h2>
          {appointments.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}

      {workouts.length === 0 ? (
        <p className="empty-note">Seu personal ainda não montou sua ficha. Assim que montar, ela aparece aqui.</p>
      ) : (
        fichas.map((ficha) => (
          <section className="ficha-group" key={ficha.id}>
            <h2>{ficha.name}</h2>
            {ficha.treinos.map((workout) => (
              <article className="workout-card" key={workout.id}>
                <h3>{workout.name}</h3>
                <details>
                  <summary>{workout.exercises.length} exercícios</summary>
                  <ol>
                    {workout.exercises.map((exercise, index) => (
                      <li key={index}>
                        {exercise.name} — {summarizeExercise(exercise).line}
                        <ExerciseNote exercise={exercise} />
                      </li>
                    ))}
                  </ol>
                </details>
                <Link className="button button-primary" href={`/aluno/treino?ficha=${encodeURIComponent(workout.id)}`}>
                  Registrar treino de hoje
                </Link>
              </article>
            ))}
          </section>
        ))
      )}
    </main>
  );
}
