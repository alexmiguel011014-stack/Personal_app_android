"use client";

import Link from "next/link";
import { groupFichas } from "../../domain/fichas";
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

  const { profile, workouts } = data;
  return (
    <main>
      <h1>Minhas fichas</h1>
      <p>Olá, {profile.name.split(" ")[0]}!</p>

      {profile.pendingAssessmentRequest && profile.canSelfAssess && (
        <section>
          <h2>Autoavaliação pendente</h2>
          <p>Seu personal pediu que você responda uma autoavaliação rápida.</p>
          <p>
            <Link href="/aluno/avaliacao">Responder agora</Link>
          </p>
        </section>
      )}

      {workouts.length === 0 ? (
        <p>Nenhuma ficha atribuída ainda. Fale com seu personal.</p>
      ) : (
        groupFichas(workouts).map((ficha) => (
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
                        {exercise.name} — {exercise.sets}x{exercise.reps}
                        {exercise.weight ? ` · ${exercise.weight}` : ""}
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
