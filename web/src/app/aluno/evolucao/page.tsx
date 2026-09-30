"use client";

import { useState, type FormEvent } from "react";
import { logOwnBiometric } from "../../../data/biometrics";
import { getFirebase } from "../../../data/firebase";
import { formatBodyFat, formatKg, parseMeasurement } from "../../../domain/biometrics";
import { formatDate, localDate } from "../../../domain/dates";
import { ProgressSection } from "../../_shared/ProgressSection";
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

  const { profile, biometrics, logs, timeZone } = data;
  return (
    <main>
      <h1>Minha evolução</h1>
      <section>
        <h2>Medidas</h2>
        {profile.canLogBiometrics && <OwnMeasurementForm uid={uid} trainerId={profile.trainerId} onSaved={reload} />}
        {biometrics.length === 0 ? (
          <p>Nenhuma medida registrada ainda.</p>
        ) : (
          <ol>
            {biometrics.map((biometric) => (
              <li key={biometric.id}>
                {formatDate(localDate(biometric.date, timeZone))} — {formatKg(biometric.weight)}
                {biometric.bodyFat > 0 && ` · ${formatBodyFat(biometric.bodyFat)} de gordura`}
              </li>
            ))}
          </ol>
        )}
      </section>
      <ProgressSection logs={logs} timeZone={timeZone} />
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

  return (
    <form onSubmit={(e) => void save(e)}>
      <fieldset>
        <legend>Registrar medida</legend>
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
  );
}
