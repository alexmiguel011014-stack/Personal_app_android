"use client";

import { useState, type FormEvent } from "react";
import type { Exercise } from "../../../../domain/exercise";
import { parseSetsText, renamedExercise } from "../../../../domain/reviewEdit";
import { applyCatalogActivations, catalogActivation, lookupExercise, type ExerciseCatalog } from "../../../../domain/exerciseCatalog";
import { volumeBand } from "../../../../domain/volumeBands";
import { calculateEffectiveVolume } from "../../../../domain/workoutParser";
import { manualExercise } from "../../../../domain/workouts";

// GOALS.md §25e: when one pasted answer holds several treinos ("Treino A", "B", "C"…), this is the
// review the trainer gets before anything is saved — what was found, and for each treino a name, an
// "incluir" box, every exercise editable (name, séries, reps) and removable, a form to add one, and the
// week's effective volume across the treinos that will be saved. One click then saves them all
// (data/workouts.ts `saveWorkouts`, a single atomic batch).
//
// Editing here cannot disturb the reading of the pasted text: that happened once, when it was pasted;
// this screen works on plain data and "Salvar" stores what it shows (domain/reviewEdit.ts has the
// rules). Pasting again, or asking Gemini to adjust, replaces what is on screen.

export interface ReviewItem {
  key: string;
  name: string;
  include: boolean;
  exercises: Exercise[];
}

const VOLUME = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function ExerciseRow({
  exercise,
  index,
  treino,
  catalog,
  onChange,
  onSelectCatalog,
  onRemove,
}: {
  exercise: Exercise;
  index: number;
  treino: string;
  catalog: ExerciseCatalog | "loading" | "error";
  onChange: (exercise: Exercise) => void;
  onSelectCatalog: (name: string) => void;
  onRemove: () => void;
}) {
  // The sets field shows what is being typed while focused (so "" or "1" on the way to "12" is
  // allowed) and the committed value otherwise; only a valid number reaches the exercise.
  const [setsDraft, setSetsDraft] = useState<string | null>(null);
  const setsText = setsDraft ?? String(exercise.sets);
  const where = `${treino || "treino"}, exercício ${index + 1}`;
  const match = typeof catalog === "object" ? lookupExercise(catalog, exercise.name) : null;
  const tableActivation = match ? catalogActivation(match.entry) : null;
  const usesDifferentActivation = match !== null && !sameActivation(exercise.muscleActivation, tableActivation);

  return (
    <li className="review-exercise">
      <span className="review-number" aria-hidden="true">
        {index + 1}.
      </span>
      <div className="review-name">
        <input
          aria-label={`Nome (${where})`}
          value={exercise.name}
          onChange={(e) => onChange(renamedExercise(exercise, e.target.value))}
        />
        {catalog === "loading" ? (
          <small>Carregando catálogo de exercícios…</small>
        ) : catalog === "error" ? (
          <small>Catálogo indisponível; revise a ativação manualmente.</small>
        ) : match?.how === "close" ? (
          <small>Correspondência aproximada com “{match.entry.name}” — confira.</small>
        ) : match ? (
          <small>{usesDifferentActivation ? "Usei a tabela" : "Ativação do catálogo"}</small>
        ) : (
          <small>
            sem ativação no catálogo{exercise.muscleActivation ? " — mantive a ativação recebida" : ""}
          </small>
        )}
        {typeof catalog === "object" && (!match || match.how === "close") && (
          <select
            aria-label={`Escolher exercício do catálogo (${where})`}
            value=""
            onChange={(event) => {
              if (event.target.value) onSelectCatalog(event.target.value);
            }}
          >
            <option value="">Escolher exercício no catálogo…</option>
            {match?.how === "close" && (
              <optgroup label="Sugestão aproximada — escolha para usar">
                <option value={match.entry.name}>{match.entry.name} — {match.entry.group}</option>
              </optgroup>
            )}
            <optgroup label="Catálogo">
              {catalog.exercises
                .filter((entry) => match?.how !== "close" || entry.name !== match.entry.name)
                .map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name} — {entry.group}
                  </option>
                ))}
            </optgroup>
          </select>
        )}
      </div>
      <input
        className="review-sets"
        aria-label={`Séries (${where})`}
        inputMode="numeric"
        value={setsText}
        aria-invalid={setsDraft !== null && parseSetsText(setsDraft) === null}
        onChange={(e) => {
          setSetsDraft(e.target.value);
          const sets = parseSetsText(e.target.value);
          if (sets !== null) onChange({ ...exercise, sets });
        }}
        onBlur={() => setSetsDraft(null)}
      />
      <input
        className="review-reps"
        aria-label={`Repetições (${where})`}
        value={exercise.reps}
        onChange={(e) => onChange({ ...exercise, reps: e.target.value })}
      />
      <button type="button" aria-label={`Remover ${exercise.name || "exercício"} (${where})`} onClick={onRemove}>
        Remover
      </button>
    </li>
  );
}

function AddExercise({ treino, onAdd }: { treino: string; onAdd: (exercise: Exercise) => void }) {
  const [name, setName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = manualExercise(name, sets, reps);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onAdd(result.exercise);
    setName("");
    setSets("");
    setReps("");
    setError(null);
  }

  return (
    <form className="review-add" onSubmit={submit}>
      <label>
        Adicionar exercício
        <input
          aria-label={`Novo exercício em ${treino || "treino"}`}
          value={name}
          placeholder="Nome"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Séries
        <input inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
      </label>
      <label>
        Reps
        <input value={reps} onChange={(e) => setReps(e.target.value)} />
      </label>
      <button type="submit">Adicionar</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function MultiFichaReview({
  items,
  catalog,
  warnings,
  errors,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  items: readonly ReviewItem[];
  catalog: ExerciseCatalog | "loading" | "error";
  warnings: readonly string[];
  errors: readonly string[];
  busy: boolean;
  onChange: (items: ReviewItem[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const included = items.filter((item) => item.include);
  const volumeExercises = included.flatMap((item) =>
    typeof catalog === "object" ? applyCatalogActivations(item.exercises, catalog) : item.exercises,
  );
  const volume = Object.entries(calculateEffectiveVolume(volumeExercises)).sort(
    ([, a], [, b]) => b - a,
  );
  const update = (key: string, change: Partial<ReviewItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...change } : item)));
  const updateExercise = (item: ReviewItem, index: number, exercise: Exercise) =>
    update(item.key, { exercises: item.exercises.map((current, i) => (i === index ? exercise : current)) });

  return (
    <section className="review" aria-labelledby="review-title">
      <h2 id="review-title">Encontrei {items.length} treinos</h2>
      <p>
        {items.map((item) => `${item.name} (${item.exercises.length})`).join(" · ")}. Confira e ajuste o que precisar —
        nome do treino, exercícios, séries e repetições — ou tire o que não quiser. Cada treino vira uma ficha do aluno.
      </p>
      {warnings.length > 0 && (
        <ul role="status">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {catalog === "error" && (
        <p role="status">Não foi possível carregar a tabela. As correspondências não serão aplicadas automaticamente.</p>
      )}

      {items.map((item) => (
        <article className="review-card" key={item.key}>
          <div className="review-card-head">
            <label>
              Nome do treino
              <input value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={item.include}
                onChange={(e) => update(item.key, { include: e.target.checked })}
              />
              Incluir
            </label>
          </div>
          {item.exercises.length === 0 ? (
            <p>Sem exercícios.</p>
          ) : (
            <>
              <div className="review-columns" aria-hidden="true">
                <span>Exercício</span>
                <span>Séries</span>
                <span>Reps</span>
              </div>
              <ol>
                {item.exercises.map((exercise, index) => (
                  <ExerciseRow
                    key={index}
                    exercise={exercise}
                    index={index}
                    treino={item.name}
                    catalog={catalog}
                    onChange={(next) => updateExercise(item, index, next)}
                    onSelectCatalog={(name) => updateExercise(item, index, { ...exercise, name })}
                    onRemove={() => update(item.key, { exercises: item.exercises.filter((_, i) => i !== index) })}
                  />
                ))}
              </ol>
            </>
          )}
          <AddExercise
            treino={item.name}
            onAdd={(exercise) => update(item.key, { exercises: [...item.exercises, exercise] })}
          />
        </article>
      ))}

      <h3>Volume efetivo por músculo (soma dos treinos incluídos)</h3>
      {volume.length === 0 ? (
        <p>Nenhum exercício traz ativação muscular, então não há volume para somar.</p>
      ) : (
        <table className="stack">
          <thead>
            <tr>
              <th scope="col">Músculo</th>
              <th scope="col">Séries efetivas</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {volume.map(([muscle, sets]) => (
              <tr key={muscle}>
                <td data-label="Músculo">{muscle}</td>
                <td data-label="Séries efetivas">{VOLUME.format(sets)}</td>
                <td data-label="Situação">{volumeBand(sets).label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {errors.length > 0 && (
        <ul role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="review-actions">
        <button
          type="button"
          className="button-primary"
          disabled={busy || included.length === 0 || catalog === "loading"}
          onClick={onSave}
        >
          {busy
            ? "Salvando…"
            : catalog === "loading"
              ? "Carregando tabela…"
              : `Salvar ${included.length} ${included.length === 1 ? "ficha" : "fichas"}`}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Voltar ao importador
        </button>
      </div>
    </section>
  );
}

function sameActivation(left: Record<string, number> | null, right: Record<string, number> | null): boolean {
  if (left === null || right === null) return left === right;
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length && leftEntries.every(([key, value], i) => {
    const other = rightEntries[i];
    return other?.[0] === key && other[1] === value;
  });
}
