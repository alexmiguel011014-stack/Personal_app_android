"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { logOwnBiometric } from "../../../data/biometrics";
import { deleteSession, loadMyLogs } from "../../../data/workoutLogs";
import { getFirebase } from "../../../data/firebase";
import { formatBodyFat, formatKg, parseMeasurement } from "../../../domain/biometrics";
import { formatDate, formatDayMonth, localDate } from "../../../domain/dates";
import { isEditableSession, type LoggedSession } from "../../../domain/sessions";
import { ConfirmDialog } from "../../_shared/ConfirmDialog";
import { LineChart } from "../../_shared/dashboard/charts";
import { ProgressSection } from "../../_shared/ProgressSection";
import { MyAssessments } from "./MyAssessments";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";

// GOALS.md §23h: the student's own evolution — StudentEvolutionScreen: their measurements (and
// "Registrar medida" only while the trainer has granted canLogBiometrics — hidden, not disabled;
// firestore.rules are the real gate), their load progression and their recent sessions.

export default function EvolutionPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Evolution uid={session.uid} />;
}

function Evolution({ uid }: { uid: string }) {
  const { data, reload } = useStudentData(uid);
  const [deleting, setDeleting] = useState<LoggedSession | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const { profile, biometrics, logs, logsFrom, timeZone, workouts, today } = data;

  async function confirmDelete() {
    if (deleting === null) return;
    const session = deleting;
    setDeleting(null);
    setDeleteError(null);
    try {
      await deleteSession(getFirebase().db, session.logs);
      reload();
    } catch {
      setDeleteError("Não foi possível excluir a sessão. Tente de novo.");
    }
  }

  // GOALS.md §38c (U7, D12): a session of the last seven days can be corrected or deleted; older ones stay as the personal saw them.
  const sessionActions = (session: LoggedSession) => {
    if (!isEditableSession(session.day, today)) return null;
    const onlyWorkout = session.workoutIds.length === 1 ? session.workoutIds[0] : null;
    const correctable = onlyWorkout !== null && workouts.some((workout) => workout.id === onlyWorkout);
    return (
      <p className="session-actions">
        {correctable && (
          <Link className="button" href={`/aluno/treino?ficha=${encodeURIComponent(onlyWorkout)}&sessao=${session.day}`}>
            Corrigir
          </Link>
        )}
        <button type="button" onClick={() => setDeleting(session)}>
          Excluir sessão
        </button>
      </p>
    );
  };
  return (
    <main>
      <h1>Minha evolução</h1>
      <section>
        <h2>Medidas</h2>
        {profile.canLogBiometrics && <OwnMeasurementForm uid={uid} trainerId={profile.trainerId} onSaved={reload} />}
        {biometrics.length === 0 ? (
          <p>Nenhuma medida registrada ainda.</p>
        ) : (
          <>
            {/* GOALS.md §38f: the weight as a line (two measurements are enough to draw one); the list stays below it. */}
            {biometrics.length >= 2 && (
              <LineChart
                title="Peso"
                points={[...biometrics].sort((a, b) => a.date - b.date).map((biometric) => ({ label: formatDayMonth(localDate(biometric.date, timeZone)), value: biometric.weight }))}
                format={formatKg}
                hiddenTable={false}
              />
            )}
            <details className="chart-table" open={biometrics.length < 2}>
              <summary>Ver todas as medidas</summary>
              <ol>
                {biometrics.map((biometric) => (
                  <li key={biometric.id}>
                    {formatDate(localDate(biometric.date, timeZone))} — {formatKg(biometric.weight)}
                    {biometric.bodyFat > 0 && ` · ${formatBodyFat(biometric.bodyFat)} de gordura`}
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </section>
      <MyAssessments uid={uid} timeZone={timeZone} />
      <ProgressSection
        logs={logs}
        timeZone={timeZone}
        workoutNames={new Map(workouts.map((workout) => [workout.id, workout.name]))}
        sessionActions={sessionActions}
        windowFrom={logsFrom}
        loadAll={() => loadMyLogs(getFirebase().db, uid)}
      />
      {deleteError && <p role="alert">{deleteError}</p>}
      <ConfirmDialog open={deleting !== null} title="Excluir esta sessão?" yesLabel="Excluir" noLabel="Cancelar" onNo={() => setDeleting(null)} onYes={() => void confirmDelete()}>
        <p>Esse processo não pode ser desfeito.</p>
        <p>As cargas desta sessão saem da sua evolução e seu personal deixa de vê-las.</p>
      </ConfirmDialog>
    </main>
  );
}

function OwnMeasurementForm({ uid, trainerId, onSaved }: { uid: string; trainerId: string; onSaved: () => void }) {
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    const measurement = parseMeasurement(weight, bodyFat);
    if ("error" in measurement) {
      setError(measurement.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await logOwnBiometric(getFirebase().db, uid, trainerId, measurement, Date.now());
      onSaved();
    } catch {
      setError("Não foi possível salvar a medida. Tente de novo.");
      setBusy(false);
    }
  }

  // GOALS.md §38f: behind one tap — the form is for the day they step on the scale, not something to scroll past every visit.
  return (
    <details className="chart-table">
      <summary>Registrar medida</summary>
      <form onSubmit={(e) => void save(e)}>
      <fieldset>
        <legend className="visually-hidden">Registrar medida</legend>
        <p>
          <label>
            Peso (kg) <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
        </p>
        <p>
          <label>
            % Gordura (opcional) <input inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
          </label>
        </p>
        <button type="submit" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
      </form>
    </details>
  );
}
