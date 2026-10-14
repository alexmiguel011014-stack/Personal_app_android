"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { getFirebase } from "../../../data/firebase";
import { logSession, updateSession } from "../../../data/workoutLogs";
import { decodePerformedSets, type Exercise } from "../../../domain/exercise";
import { summarizeExercise } from "../../../domain/exerciseDetails";
import { formatDayMonth } from "../../../domain/dates";
import { formatLastSets, lastPerformance, repeatRows, rowPlaceholder, type LastPerformance } from "../../../domain/lastPerformance";
import type { WorkoutLogDoc } from "../../../domain/metrics";
import { adjustRest, clock, restDuration } from "../../../domain/restTimer";
import { summarizeSession, type SessionSummary } from "../../../domain/sessionSummary";
import { LOG_DRAFT_MAX_AGE_MS, applyLogDraft, draftKey, logDraftHasContent, readDraft, removeDraft, validateLogDraft, writeDraft } from "../../../domain/formDraft";
import { canAddExtraRow, initialRows, isExtraRow, rowsFromSets, sessionEntries, type SetRow } from "../../../domain/sessionLog";
import { groupSessions, isEditableSession, type LoggedSession } from "../../../domain/sessions";
import type { Workout } from "../../../domain/workouts";
import { browserStorage } from "../../_shared/browserStorage";
import { ConfirmDialog } from "../../_shared/ConfirmDialog";
import { ExerciseNote } from "../../_shared/ExerciseNote";
import { useSession } from "../../SessionProvider";
import { useStudentData } from "../useStudentData";
import { RestTimerChip, type RestTimer } from "./RestTimerChip";
import { createAudio } from "./restAlert";

// GOALS.md §23h: logging today's session — StudentLogSessionScreen. Each exercise gets rows of
// weight and reps; on save, every exercise with a complete row becomes one workoutLogs document
// (domain/sessionLog.ts has the rules). Rows are kept per exercise *name*, as on the phone.

export function LogSession() {
  const { session } = useSession();
  const params = useSearchParams();
  const workoutId = params.get("ficha") ?? "";
  // GOALS.md §38c (D12): with `sessao=YYYY-MM-DD` the form corrects that day's session instead of starting a new one.
  const day = params.get("sessao");
  if (session.status !== "signedIn") return null;
  return <Loader uid={session.uid} workoutId={workoutId} day={day} />;
}

function Loader({ uid, workoutId, day }: { uid: string; workoutId: string; day: string | null }) {
  const { data, invalidate } = useStudentData(uid);
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
  let editing: LoggedSession | undefined;
  if (day !== null) {
    editing = groupSessions(data.logs, data.timeZone, uid).find((s) => s.day === day && s.workoutIds.length === 1 && s.workoutIds[0] === workout.id);
    if (!editing || !isEditableSession(day, data.today)) {
      return (
        <main>
          <p>Esta sessão não pode mais ser corrigida.</p>
          <p>
            <Link href="/aluno/evolucao">Voltar para a evolução</Link>
          </p>
        </main>
      );
    }
  }
  return (
    <SessionForm
      uid={uid}
      trainerId={data.profile.trainerId}
      workout={workout}
      canAddSets={data.profile.canAddSets}
      editing={editing}
      logs={data.logs}
      timeZone={data.timeZone}
      today={data.today}
      onSaved={invalidate}
    />
  );
}

/** 45 → "45kg"; 42.5 → "42,5kg". */
function kilos(weight: number): string {
  return `${String(weight).replace(".", ",")}kg`;
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

function SessionForm({
  uid,
  trainerId,
  workout,
  canAddSets,
  editing,
  logs,
  timeZone,
  today,
  onSaved,
}: {
  uid: string;
  trainerId: string;
  workout: Workout;
  /** Granted by the trainer (users.canAddSets); off by default, so there is no "Adicionar série" at all. */
  canAddSets: boolean;
  /** GOALS.md §38c: the session being corrected, when there is one — its sets come back into the rows. */
  editing?: LoggedSession;
  /** GOALS.md §38e: the aluno's logs in memory (§38b's window) — "Última vez" and the records come from them, no read. */
  logs: readonly WorkoutLogDoc[];
  timeZone: string;
  today: string;
  /** GOALS.md §38b: the aluno's data in memory no longer has this session; the next page reads it again. */
  onSaved: () => void;
}) {
  const exercises = uniqueByName(workout.exercises);
  // The exercise a "Deseja adicionar uma série extra?" question is open for, if any.
  const [confirming, setConfirming] = useState<Exercise | null>(null);
  const [rows, setRows] = useState<Map<string, SetRow[]>>(
    () =>
      new Map(
        exercises.map((exercise) => {
          const log = editing?.logs.find((candidate) => candidate.exerciseName === exercise.name);
          return [exercise.name, log ? rowsFromSets(decodePerformedSets(log.performedSetsJson), exercise.sets) : initialRows(exercise.sets)];
        }),
      ),
  );
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  // GOALS.md §38e (D8): one rest timer at a time; the AudioContext is made inside the tap that starts it.
  const [rest, setRest] = useState<RestTimer | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entries = sessionEntries(rows);

  // GOALS.md §38e (U5): the last session before this one (before the corrected day, when correcting) for each exercise.
  const beforeDay = editing ? editing.day : today;
  const lastByExercise = useMemo(
    () => new Map(uniqueByName(workout.exercises).map((exercise) => [exercise.name, lastPerformance(logs, exercise.name, beforeDay, timeZone)])),
    [workout.exercises, logs, beforeDay, timeZone],
  );

  function repeatLast(exercise: Exercise, last: LastPerformance) {
    setRows((previous) => new Map(previous).set(exercise.name, repeatRows(previous.get(exercise.name) ?? [], last, exercise.sets, canAddSets)));
  }

  function startRest(exercise: Exercise, now: number) {
    audio.current ??= createAudio();
    setRest({ exercise: exercise.name, startedAt: now, endsAt: now + restDuration(exercise.restSeconds) * 1000 });
  }

  // GOALS.md §38c, D7: what was typed survives a reload, a discarded tab or a locked phone at the gym, until the session
  // is saved. A draft found on the device waits for the person's answer; nothing is written meanwhile, or it would
  // overwrite the very draft being offered. (This form only mounts once the aluno's data is loaded, in the browser.)
  const draftId = draftKey("log", uid, workout.id);
  const [draftFound, setDraftFound] = useState(() => {
    if (editing) return null; // a correction is short, and starts from what was saved — no draft
    const found = readDraft(browserStorage(), draftId, Date.now(), LOG_DRAFT_MAX_AGE_MS, validateLogDraft);
    return found && logDraftHasContent(found.data) ? found : null;
  });
  useEffect(() => {
    if (editing || draftFound !== null || saved) return;
    const storage = browserStorage();
    if (logDraftHasContent(rows)) writeDraft(storage, draftId, Object.fromEntries(rows), Date.now());
    else removeDraft(storage, draftId);
  }, [rows, draftFound, saved, draftId, editing]);

  function edit(name: string, index: number, change: Partial<SetRow>) {
    setRows((previous) => {
      const next = new Map(previous);
      const list = [...(next.get(name) ?? [])];
      list[index] = { ...list[index], ...change };
      next.set(name, list);
      return next;
    });
  }

  function addRow(exercise: Exercise) {
    setRows((previous) => {
      const current = previous.get(exercise.name) ?? [];
      // Defence in depth: the button is hidden without the permission, and this refuses too.
      if (!canAddExtraRow(canAddSets, current.length, exercise.sets)) return previous;
      return new Map(previous).set(exercise.name, [...current, { weight: "", reps: "" }]);
    });
  }

  /** Removes a row the student added — and only that: a prescribed row is never removable. */
  function removeExtraRow(exercise: Exercise, index: number) {
    if (!isExtraRow(index, exercise.sets)) return;
    setRows((previous) => {
      const next = new Map(previous);
      next.set(
        exercise.name,
        (previous.get(exercise.name) ?? []).filter((_, i) => i !== index),
      );
      return next;
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (entries.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      if (editing) await updateSession(getFirebase().db, uid, trainerId, workout.id, editing.logs, entries);
      else await logSession(getFirebase().db, uid, trainerId, workout.id, entries, Date.now());
      removeDraft(browserStorage(), draftId);
      if (!editing) setSummary(summarizeSession(entries, logs));
      setRest(null);
      onSaved();
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
        <p role="status">{editing ? "Sessão corrigida." : "Treino registrado! Seu personal já pode ver."}</p>
        {summary && (
          <section>
            <p>
              {summary.exercises} {summary.exercises === 1 ? "exercício" : "exercícios"} · {summary.sets} {summary.sets === 1 ? "série" : "séries"}
            </p>
            {summary.records.length > 0 && (
              <>
                <h2>Recordes</h2>
                <ul className="records">
                  {summary.records.map((record) => (
                    <li key={record.exercise}>
                      <strong>{record.exercise}</strong>: {kilos(record.weight)} × {record.reps} — antes, {kilos(record.previousBest)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }

  if (draftFound !== null) {
    return (
      <main>
        <p className="eyebrow">
          <Link href="/aluno">← Fichas</Link>
        </p>
        <h1>{workout.name}</h1>
        <div role="status" className="resume">
          <p>Você tem um treino não salvo de {new Date(draftFound.savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</p>
          <div className="resume-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                const blank = new Map(exercises.map((exercise) => [exercise.name, initialRows(exercise.sets)]));
                setRows(applyLogDraft(blank, draftFound.data, canAddSets));
                setDraftFound(null);
              }}
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={() => {
                removeDraft(browserStorage(), draftId);
                setDraftFound(null);
              }}
            >
              Descartar
            </button>
          </div>
        </div>
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
        {exercises.map((exercise) => {
          const last = lastByExercise.get(exercise.name) ?? null;
          const exerciseRows = rows.get(exercise.name) ?? [];
          return (
            <fieldset key={exercise.name}>
              <legend>{exercise.name}</legend>
              <div className="exercise-info">
                <p>Alvo: {summarizeExercise(exercise).line}</p>
                {last && (
                  <p className="exercise-last">
                    Última vez ({formatDayMonth(last.day)}): {formatLastSets(last.sets)}
                  </p>
                )}
              </div>
              <ExerciseNote exercise={exercise} />
              <div className="exercise-tools">
                {last && (
                  <button type="button" onClick={() => repeatLast(exercise, last)}>
                    Repetir a última
                  </button>
                )}
                <button type="button" onClick={() => startRest(exercise, Date.now())}>
                  Descansar {clock(restDuration(exercise.restSeconds))}
                </button>
              </div>
              <div className="set-table">
                <div className="set-head" aria-hidden="true">
                  <span>Série</span>
                  <span>Peso</span>
                  <span>Reps</span>
                </div>
                {exerciseRows.map((row, index) => {
                  const hint = rowPlaceholder(last, exercise, index);
                  return (
                    <div className={`set-row${isExtraRow(index, exercise.sets) ? " is-extra" : ""}`} key={index}>
                      <span className="set-number">
                        {index + 1}
                        {isExtraRow(index, exercise.sets) && <small> extra</small>}
                      </span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Peso da série ${index + 1}`}
                        placeholder={hint.weight}
                        value={row.weight}
                        onChange={(e) => edit(exercise.name, index, { weight: e.target.value })}
                      />
                      <input
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Reps da série ${index + 1}`}
                        placeholder={hint.reps}
                        value={row.reps}
                        onChange={(e) => edit(exercise.name, index, { reps: e.target.value })}
                      />
                      {isExtraRow(index, exercise.sets) && (
                        <button
                          type="button"
                          aria-label={`Remover a série extra ${index + 1} de ${exercise.name}`}
                          onClick={() => removeExtraRow(exercise, index)}
                        >
                          Remover série extra
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {canAddExtraRow(canAddSets, exerciseRows.length, exercise.sets) && (
                <button
                  type="button"
                  aria-label={`Adicionar série em ${exercise.name}`}
                  onClick={() => setConfirming(exercise)}
                >
                  Adicionar série
                </button>
              )}
            </fieldset>
          );
        })}
        {error && <p role="alert">{error}</p>}
        <div className="sticky-actions">
          {rest && (
            <RestTimerChip
              key={rest.startedAt}
              timer={rest}
              audio={audio}
              onAdjust={(delta) => setRest((current) => (current ? { ...current, endsAt: adjustRest(current.endsAt, delta, Date.now()) } : current))}
              onClose={() => setRest(null)}
            />
          )}
          <button type="submit" disabled={busy || entries.length === 0}>
            {busy ? "Salvando…" : editing ? "Salvar correção" : "Salvar sessão"}
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming !== null}
        title="Adicionar uma série extra?"
        onNo={() => setConfirming(null)}
        onYes={() => {
          if (confirming !== null) addRow(confirming);
          setConfirming(null);
        }}
      >
        <p>
          Deseja adicionar uma série extra em <strong>{confirming?.name}</strong>? As séries da ficha continuam como
          estão; você poderá remover só a que acrescentar.
        </p>
      </ConfirmDialog>
    </main>
  );
}
