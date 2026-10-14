"use client";

import { useState, type ReactNode } from "react";
import { formatKg } from "../../domain/biometrics";
import { formatDate, formatDayMonth, localDate } from "../../domain/dates";
import type { WorkoutLogDoc } from "../../domain/metrics";
import { loadProgression, loggedExercises } from "../../domain/progression";
import { groupSessions, sessionTitle, type LoggedSession } from "../../domain/sessions";
import { LineChart } from "./dashboard/charts";

/** "Atividade recente" opens on the newest few sessions; "Ver mais sessões" lists up to RECENT_SESSIONS (GOALS.md §38c, U6). */
const FIRST_SESSIONS = 3;
const RECENT_SESSIONS = 8;

// GOALS.md §23g/§23h: the phone's "Progressão de Carga" chart as a table — pick an exercise, see its
// heaviest set per session — and its "Atividade Recente" list, from one student's logs. Shared by
// the trainer's page for that student and the student's own evolution, as ExerciseProgressionChart
// is on the phone. (`_shared` — the underscore keeps the folder out of the routes.)

export function ProgressSection({
  logs: recent,
  timeZone,
  workoutNames,
  sessionActions,
  windowFrom,
  loadAll,
}: {
  logs: readonly WorkoutLogDoc[];
  timeZone: string;
  /** The treinos the reader can see, by id — a session is titled with its treino ("Treino removido" when it is gone). Left out: no title. */
  workoutNames?: ReadonlyMap<string, string>;
  /** Buttons under a session (the aluno's "Corrigir" / "Excluir sessão"); none for the personal. */
  sessionActions?: (session: LoggedSession) => ReactNode;
  /** GOALS.md §38b: where `logs` starts when it is a window of recent logs, not the whole history. */
  windowFrom?: number;
  /** Reads the whole history — only when the person asks for it ("Ver histórico completo"). */
  loadAll?: () => Promise<WorkoutLogDoc[]>;
}) {
  const [history, setHistory] = useState<WorkoutLogDoc[] | "loading" | "error" | null>(null);
  const [moreSessions, setMoreSessions] = useState(false);
  const logs = Array.isArray(history) ? history : recent;
  const exercises = loggedExercises(logs);
  const [picked, setPicked] = useState<string | null>(null);
  const exercise = picked !== null && exercises.includes(picked) ? picked : (exercises[0] ?? null);
  const points = exercise === null ? [] : loadProgression(logs, exercise);
  const recentSessions = groupSessions(logs, timeZone).slice(0, RECENT_SESSIONS);
  const sessions = moreSessions ? recentSessions : recentSessions.slice(0, FIRST_SESSIONS);

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
              <>
                {/* GOALS.md §38f: the line first; the table stays, one tap away, for the exact dates and loads. */}
                {points.length >= 2 && (
                  <LineChart
                    title={`Maior carga de ${exercise}`}
                    points={points.map((point) => ({ label: formatDayMonth(localDate(point.date, timeZone)), value: point.maxWeight }))}
                    format={formatKg}
                    hiddenTable={false}
                  />
                )}
                <details className="chart-table" open={points.length < 2}>
                  <summary>Ver em tabela</summary>
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
                </details>
              </>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Atividade recente</h2>
        {sessions.length === 0 ? (
          <p>Nenhuma sessão registrada ainda.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((session) => (
              <li key={session.key}>
                <h3>
                  {formatDate(session.day)}
                  {workoutNames !== undefined && ` · ${sessionTitle(session, workoutNames)}`}
                </h3>
                <ul>
                  {session.exercises.map((exercise, index) => (
                    <li key={index}>
                      {exercise.name} — {exercise.sets || "—"}
                    </li>
                  ))}
                </ul>
                {sessionActions?.(session)}
              </li>
            ))}
          </ul>
        )}
        {recentSessions.length > FIRST_SESSIONS && (
          <p>
            <button type="button" onClick={() => setMoreSessions(!moreSessions)}>
              {moreSessions ? "Ver menos sessões" : "Ver mais sessões"}
            </button>
          </p>
        )}
        {loadAll && windowFrom !== undefined && !Array.isArray(history) && (
          <p className="section-footnote">
            Mostrando os registros desde {formatDate(localDate(windowFrom, timeZone))}.{" "}
            <button
              type="button"
              disabled={history === "loading"}
              onClick={() => {
                setHistory("loading");
                loadAll().then(setHistory, () => setHistory("error"));
              }}
            >
              {history === "loading" ? "Buscando o histórico…" : "Ver histórico completo"}
            </button>
            {history === "error" && <span role="alert"> Não foi possível buscar o histórico. Tente de novo.</span>}
          </p>
        )}
      </section>
    </>
  );
}
