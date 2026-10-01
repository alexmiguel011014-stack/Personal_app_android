"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebase } from "../../../../data/firebase";
import { deleteWorkout, loadStudentWorkouts, saveWorkout } from "../../../../data/workouts";
import { formatDate, localDate } from "../../../../domain/dates";
import { splitFichas } from "../../../../domain/fichaHistory";
import type { Workout } from "../../../../domain/workouts";

// GOALS.md §23g: a student's fichas, with WorkoutBuilderScreen's controls (edit, activate, delete).
//
// New fichas only for a connected student, on purpose — stricter than Android. A ficha is keyed to
// the student's id, and claiming an invite gives the student a *new* id (their account's uid), so a
// ficha made for the draft stays on the draft and the student never sees it after joining.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; workouts: Workout[] };

/**
 * GOALS.md §28: the list as three groups — what the student sees, the one previous ficha a replacement
 * kept, and every other inactive treino (drafts, or deactivated by hand: never touched by a replacement).
 */
function groupsOf(workouts: Workout[]): { key: string; title: string; note: string; workouts: Workout[] }[] {
  const { current, history, others } = splitFichas(workouts);
  return [
    { key: "current", title: "Ficha atual", note: "o aluno vê", workouts: current },
    {
      key: "history",
      title: "Ficha anterior (histórico)",
      note: "só você vê; é excluída quando você substituir a ficha de novo",
      workouts: history,
    },
    { key: "others", title: "Outras (inativas)", note: "rascunhos e fichas desativadas; o aluno não vê", workouts: others },
  ].filter((group) => group.workouts.length > 0);
}

function statusLine(workout: Workout, timeZone: string): string {
  if (workout.isActive) {
    return `Ativa — o aluno vê${workout.assignedAt ? ` (desde ${formatDate(localDate(workout.assignedAt, timeZone))})` : ""}`;
  }
  if (workout.archivedAt !== null) {
    return `Arquivada em ${formatDate(localDate(workout.archivedAt, timeZone))} — o aluno não vê`;
  }
  return "Inativa — o aluno não vê";
}

export function WorkoutsSection({
  trainerId,
  studentId,
  connected,
  timeZone,
}: {
  trainerId: string;
  studentId: string;
  connected: boolean;
  timeZone: string;
}) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStudentWorkouts(getFirebase().db, trainerId, studentId).then(
      (workouts) => !cancelled && setState({ status: "ready", workouts }),
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId, version]);

  async function run(write: () => Promise<unknown>) {
    setError(null);
    try {
      await write();
      setVersion((v) => v + 1);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  const db = () => getFirebase().db;
  const editorUrl = (workoutId?: string) =>
    `/app/fichas/editar?aluno=${encodeURIComponent(studentId)}${workoutId ? `&id=${encodeURIComponent(workoutId)}` : ""}`;

  return (
    <section>
      <h2>Fichas</h2>
      {connected ? (
        <p>
          <Link href={editorUrl()}>Nova ficha</Link>
        </p>
      ) : (
        <p>
          Conecte o aluno pelo convite antes de montar fichas: uma ficha feita para o cadastro ainda não
          conectado fica presa a ele, e o aluno não a vê depois de entrar.
        </p>
      )}
      {state.status === "loading" && <p className="loading">Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar as fichas.</p>}
      {state.status === "ready" && state.workouts.length === 0 && <p>Nenhuma ficha ainda.</p>}
      {state.status === "ready" &&
        groupsOf(state.workouts).map((group) => (
          <div key={group.key}>
            <p className="eyebrow">
              <strong>{group.title}</strong>
              {group.note ? ` — ${group.note}` : ""}
            </p>
            {group.workouts.map((workout) => (
              <article key={workout.id}>
                <h3>{workout.name}</h3>
                <p>{statusLine(workout, timeZone)}</p>
                <ol>
                  {workout.exercises.map((exercise, index) => (
                    <li key={index}>
                      {exercise.name} — {exercise.sets} × {exercise.reps}
                    </li>
                  ))}
                </ol>
                <p>
                  <Link href={editorUrl(workout.id)}>Editar</Link>{" "}
                  <button
                    type="button"
                    onClick={() => void run(() => saveWorkout(db(), trainerId, { ...workout, isActive: !workout.isActive }, Date.now()))}
                  >
                    {workout.isActive ? "Desativar" : "Ativar"}
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Excluir a ficha "${workout.name}"?`)) void run(() => deleteWorkout(db(), workout.id));
                    }}
                  >
                    Excluir
                  </button>
                </p>
              </article>
            ))}
          </div>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
