"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getFirebase } from "../../../data/firebase";
import { logSession } from "../../../data/workoutLogs";
import type { Exercise } from "../../../domain/exercise";
import { initialRows, sessionEntries, type SetRow } from "../../../domain/sessionLog";
import type { Workout } from "../../../domain/workouts";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";

// GOALS.md §23h: logging today's session — StudentLogSessionScreen. Each exercise gets rows of
// weight and reps; on save, every exercise with a complete row becomes one workoutLogs document
// (domain/sessionLog.ts has the rules). Rows are kept per exercise *name*, as on the phone.

export function LogSession() {
  const { session } = useSession();
  const workoutId = useSearchParams().get("ficha") ?? "";
  if (session.status !== "signedIn") return null;
  return <Loader uid={session.uid} workoutId={workoutId} />;
}

function Loader({ uid, workoutId }: { uid: string; workoutId: string }) {
  const { data } = useStudentData(uid);
  if (data.status === "loading") return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  const workout = data.workouts.find((w) => w.id === workoutId);
  if (!workout) {
    return (
      <main>
        <p>Ficha não encontrada.</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }
  return <SessionForm uid={uid} trainerId={data.profile.trainerId} workout={workout} />;
}

/** The ficha's exercises, one per name — the phone keys a session's rows by name. */
function uniqueByName(exercises: readonly Exercise[]): Exercise[] {
  const seen = new Set<string>();
  return exercises.filter((exercise) => {
    if (seen.has(exercise.name)) return false;
    seen.add(exercise.name);
    return true;
  });
}

function SessionForm({ uid, trainerId, workout }: { uid: string; trainerId: string; workout: Workout }) {
  const exercises = uniqueByName(workout.exercises);
  const [rows, setRows] = useState<Map<string, SetRow[]>>(
    () => new Map(exercises.map((exercise) => [exercise.name, initialRows(exercise.sets)])),
  );
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entries = sessionEntries(rows);

  function edit(name: string, index: number, change: Partial<SetRow>) {
    setRows((previous) => {
      const next = new Map(previous);
      const list = [...(next.get(name) ?? [])];
      list[index] = { ...list[index], ...change };
      next.set(name, list);
      return next;
    });
  }

  function addRow(name: string) {
    setRows((previous) => new Map(previous).set(name, [...(previous.get(name) ?? []), { weight: "", reps: "" }]));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (entries.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await logSession(getFirebase().db, uid, trainerId, workout.id, entries, Date.now());
      setSaved(true);
    } catch {
      setError("Não foi possível salvar o treino. Verifique a conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <main>
        <h1>{workout.name}</h1>
        <p role="status">Treino registrado! Seu personal já pode ver.</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p className="eyebrow">
        <Link href="/aluno">← Fichas</Link>
      </p>
      <h1>{workout.name}</h1>
      <p>Anote o peso e as repetições de cada série que você fez. Séries em branco não contam.</p>
      <form onSubmit={(e) => void save(e)}>
        {exercises.map((exercise) => (
          <fieldset key={exercise.name}>
            <legend>{exercise.name}</legend>
            <p>
              Alvo: {exercise.sets}x{exercise.reps}
              {exercise.weight ? ` · ${exercise.weight}` : ""}
            </p>
            {(rows.get(exercise.name) ?? []).map((row, index) => (
              <p className="set-row" key={index}>
                <span className="set-number">Série {index + 1}</span>
                <label>
                  Peso{" "}
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Peso da série ${index + 1}`}
                    value={row.weight}
                    onChange={(e) => edit(exercise.name, index, { weight: e.target.value })}
                  />
                </label>
                <label>
                  Reps{" "}
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`Reps da série ${index + 1}`}
                    value={row.reps}
                    onChange={(e) => edit(exercise.name, index, { reps: e.target.value })}
                  />
                </label>
              </p>
            ))}
            <button type="button" aria-label={`Adicionar série em ${exercise.name}`} onClick={() => addRow(exercise.name)}>
              Adicionar série
            </button>
          </fieldset>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="sticky-actions">
          <button type="submit" disabled={busy || entries.length === 0}>
            {busy ? "Salvando…" : "Salvar sessão"}
          </button>
        </div>
      </form>
    </main>
  );
}
