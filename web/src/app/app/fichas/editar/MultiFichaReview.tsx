"use client";

import type { Exercise } from "../../../../domain/exercise";
import { volumeBand } from "../../../../domain/volumeBands";
import { calculateEffectiveVolume } from "../../../../domain/workoutParser";

// GOALS.md §25e: when one pasted answer holds several treinos ("Treino A", "B", "C"…), this is the
// review the trainer gets before anything is saved — what was found, a name and an "incluir" box per
// treino, each exercise removable, and the week's effective volume across the treinos that will be
// saved. One click then saves them all (data/workouts.ts `saveWorkouts`, a single atomic batch).
// Each saved ficha can still be edited afterwards from the student's page, as any other.

export interface ReviewItem {
  key: string;
  name: string;
  include: boolean;
  exercises: Exercise[];
}

const VOLUME = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function MultiFichaReview({
  items,
  warnings,
  errors,
  busy,
  onChange,
  onSave,
  onCancel,
}: {
  items: readonly ReviewItem[];
  warnings: readonly string[];
  errors: readonly string[];
  busy: boolean;
  onChange: (items: ReviewItem[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const included = items.filter((item) => item.include);
  const volume = Object.entries(calculateEffectiveVolume(included.flatMap((item) => item.exercises))).sort(
    ([, a], [, b]) => b - a,
  );
  const update = (key: string, change: Partial<ReviewItem>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...change } : item)));

  return (
    <section className="review" aria-labelledby="review-title">
      <h2 id="review-title">Encontrei {items.length} treinos</h2>
      <p>
        {items.map((item) => `${item.name} (${item.exercises.length})`).join(" · ")}. Confira, ajuste os nomes e tire o
        que não quiser — cada treino vira uma ficha do aluno.
      </p>
      {warnings.length > 0 && (
        <ul role="status">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {items.map((item) => (
        <article className="review-card" key={item.key}>
          <div className="review-card-head">
            <label>
              Nome do treino
              <input value={item.name} onChange={(e) => update(item.key, { name: e.target.value })} />
            </label>
            <label>
              <input type="checkbox" checked={item.include} onChange={(e) => update(item.key, { include: e.target.checked })} />
              Incluir
            </label>
          </div>
          {item.exercises.length === 0 ? (
            <p>Sem exercícios.</p>
          ) : (
            <ol>
              {item.exercises.map((exercise, index) => (
                <li key={index}>
                  <span>
                    {exercise.name} — {exercise.sets}x{exercise.reps}
                    {exercise.muscleActivation === null && <small> · sem ativação muscular</small>}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remover ${exercise.name} de ${item.name}`}
                    onClick={() => update(item.key, { exercises: item.exercises.filter((_, i) => i !== index) })}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ol>
          )}
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
        <button type="button" className="button-primary" disabled={busy || included.length === 0} onClick={onSave}>
          {busy ? "Salvando…" : `Salvar ${included.length} ${included.length === 1 ? "ficha" : "fichas"}`}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Voltar ao importador
        </button>
      </div>
    </section>
  );
}
