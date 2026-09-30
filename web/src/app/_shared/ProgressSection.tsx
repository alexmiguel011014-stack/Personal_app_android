"use client";

import { useState } from "react";
import { formatKg } from "../../domain/biometrics";
import { formatDate, formatDateTime, localDate } from "../../domain/dates";
import { decodePerformedSets } from "../../domain/exercise";
import type { WorkoutLogDoc } from "../../domain/metrics";
import { formatSets, loadProgression, loggedExercises, recentLogs } from "../../domain/progression";

// GOALS.md §23g/§23h: the phone's "Progressão de Carga" chart as a table — pick an exercise, see its
// heaviest set per session — and its "Atividade Recente" list, from one student's logs. Shared by
// the trainer's page for that student and the student's own evolution, as ExerciseProgressionChart
// is on the phone. (`_shared` — the underscore keeps the folder out of the routes.)

export function ProgressSection({ logs, timeZone }: { logs: readonly WorkoutLogDoc[]; timeZone: string }) {
  const exercises = loggedExercises(logs);
  const [picked, setPicked] = useState<string | null>(null);
  const exercise = picked !== null && exercises.includes(picked) ? picked : (exercises[0] ?? null);
  const points = exercise === null ? [] : loadProgression(logs, exercise);

  return (
    <>
      <section>
        <h2>Progressão de carga</h2>
        {exercise === null ? (
          <p>Nenhuma sessão registrada ainda.</p>
        ) : (
          <>
            <p>
              <label>
                Exercício{" "}
                <select value={exercise} onChange={(e) => setPicked(e.target.value)}>
                  {exercises.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </p>
            {points.length === 0 ? (
              <p>Sem sessões com carga registrada para este exercício ainda.</p>
            ) : (
              <table className="stack">
                <thead>
                  <tr>
                    <th scope="col">Data</th>
                    <th scope="col">Maior carga</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr key={index}>
                      <td data-label="Data">{formatDate(localDate(point.date, timeZone))}</td>
                      <td data-label="Maior carga">{formatKg(point.maxWeight)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Atividade recente</h2>
        {logs.length === 0 ? (
          <p>Nenhuma sessão registrada ainda.</p>
        ) : (
          <table className="stack">
            <thead>
              <tr>
                <th scope="col">Exercício</th>
                <th scope="col">Quando</th>
                <th scope="col">Séries (carga × reps)</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs(logs).map((log) => (
                <tr key={log.id}>
                  <td data-label="Exercício">{log.exerciseName}</td>
                  <td data-label="Quando">{formatDateTime(log.date, timeZone)}</td>
                  <td data-label="Séries (carga × reps)">{formatSets(decodePerformedSets(log.performedSetsJson)) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
