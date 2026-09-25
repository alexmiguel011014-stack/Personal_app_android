"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getFirebase } from "../../../../data/firebase";
import { deleteWorkout, loadStudentWorkouts, saveWorkout } from "../../../../data/workouts";
import { formatDate, localDate } from "../../../../domain/dates";
import type { Workout } from "../../../../domain/workouts";

// GOALS.md §23g: a student's fichas, with WorkoutBuilderScreen's controls (edit, activate, delete).
//
// New fichas only for a connected student, on purpose — stricter than Android. A ficha is keyed to
// the student's id, and claiming an invite gives the student a *new* id (their account's uid), so a
// ficha made for the draft stays on the draft and the student never sees it after joining.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; workouts: Workout[] };

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
      {state.status === "loading" && <p>Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar as fichas.</p>}
      {state.status === "ready" && state.workouts.length === 0 && <p>Nenhuma ficha ainda.</p>}
      {state.status === "ready" &&
        state.workouts.map((workout) => (
          <article key={workout.id}>
            <h3>{workout.name}</h3>
            <p>
              {workout.isActive
                ? `Ativa — o aluno vê${workout.assignedAt ? ` (desde ${formatDate(localDate(workout.assignedAt, timeZone))})` : ""}`
                : "Inativa — o aluno não vê"}
            </p>
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
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
