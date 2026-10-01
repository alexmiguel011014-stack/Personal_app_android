"use client";

import { useEffect, useState, type FormEvent } from "react";
import { addBiometric, loadStudentBiometrics } from "../../../../data/biometrics";
import { trackActivity } from "../../../../data/activity";
import { getFirebase } from "../../../../data/firebase";
import { formatBodyFat, formatKg, parseMeasurement, type Biometric } from "../../../../domain/biometrics";
import { formatDate, localDate } from "../../../../domain/dates";

// GOALS.md §23g: the phone's "Evolução de Peso" chart and "Últimas Medidas" list as one table, plus
// its "Nova Medida" dialog. New measurements only for a connected student, for the reason fichas are
// (WorkoutsSection): one recorded for a draft stays on the draft.

type State = { status: "loading" } | { status: "error" } | { status: "ready"; biometrics: Biometric[] };

export function MeasurementsSection({
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
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadStudentBiometrics(getFirebase().db, trainerId, studentId).then(
      (biometrics) => !cancelled && setState({ status: "ready", biometrics }),
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, studentId, version]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const measurement = parseMeasurement(weight, bodyFat);
    if ("error" in measurement) {
      setMessage(measurement.error);
      return;
    }
    setBusy(true);
    try {
      const { db } = getFirebase();
      const now = Date.now();
      await addBiometric(db, trainerId, studentId, measurement, now);
      await trackActivity(db, trainerId, "measurementAdded", now, timeZone);
      setWeight("");
      setBodyFat("");
      setMessage(null);
      setVersion((v) => v + 1);
    } catch {
      setMessage("Não foi possível salvar a medida. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Medidas</h2>
      {connected ? (
        <form onSubmit={add}>
          <fieldset>
            <legend>Nova medida</legend>
            <label>
              Peso (kg) <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>{" "}
            <label>
              % Gordura (opcional) <input inputMode="decimal" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
            </label>{" "}
            <button type="submit" disabled={busy}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
            {message && <p role="alert">{message}</p>}
          </fieldset>
        </form>
      ) : (
        <p>
          Conecte o aluno pelo convite antes de registrar medidas: uma medida feita para o cadastro ainda não
          conectado fica presa a ele.
        </p>
      )}
      {state.status === "loading" && <p className="loading">Carregando…</p>}
      {state.status === "error" && <p role="alert">Não foi possível carregar as medidas.</p>}
      {state.status === "ready" && state.biometrics.length === 0 && <p>Nenhuma medida registrada ainda.</p>}
      {state.status === "ready" && state.biometrics.length > 0 && (
        <table className="stack">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Peso</th>
              <th scope="col">% Gordura</th>
            </tr>
          </thead>
          <tbody>
            {state.biometrics.map((biometric) => (
              <tr key={biometric.id}>
                <td data-label="Data">{formatDate(localDate(biometric.date, timeZone))}</td>
                <td data-label="Peso">{formatKg(biometric.weight)}</td>
                <td data-label="% Gordura">{formatBodyFat(biometric.bodyFat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
