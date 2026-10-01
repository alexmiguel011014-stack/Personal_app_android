"use client";

import { useState } from "react";
import {
  DEFAULT_WEEKLY_TARGET,
  EMPTY_OPTIONS,
  SPLITS,
  composeRequest,
  defaultTreinos,
  type RequestOptions,
  type SplitId,
} from "../../../../domain/fichaRequest";

// GOALS.md §25f: a few quick picks that compose "O que você quer nesta ficha?" — the number of
// treinos (the student's training days by default), the split, the weekly target, emphasis and
// limits. They write into the textarea below, which stays editable: nothing is hidden behind them.
// Shared by both ways of asking (copy the prompt to another AI, or generate with Gemini).

export function RequestBuilder({
  trainingDays,
  request,
  onRequest,
}: {
  trainingDays: readonly string[];
  request: string;
  onRequest: (text: string) => void;
}) {
  const [options, setOptions] = useState<RequestOptions>({
    ...EMPTY_OPTIONS,
    treinos: defaultTreinos(trainingDays),
    weeklyTarget: DEFAULT_WEEKLY_TARGET,
  });
  const set = (change: Partial<RequestOptions>) => setOptions((current) => ({ ...current, ...change }));

  return (
    <>
      <fieldset>
        <legend>Atalhos para montar o pedido</legend>
        <label>
          Quantos treinos
          <select
            value={options.treinos ?? ""}
            onChange={(e) => set({ treinos: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">Deixe a IA decidir</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Divisão
          <select value={options.split} onChange={(e) => set({ split: e.target.value as SplitId })}>
            {SPLITS.map((split) => (
              <option key={split.id} value={split.id}>
                {split.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Volume semanal alvo
          <input value={options.weeklyTarget} onChange={(e) => set({ weeklyTarget: e.target.value })} />
        </label>
        <label>
          Ênfase
          <input
            value={options.emphasis}
            placeholder="Ex: ombros e glúteos"
            onChange={(e) => set({ emphasis: e.target.value })}
          />
        </label>
        <label>
          Limites (equipamento, tempo)
          <input
            value={options.limits}
            placeholder="Ex: só halteres, 45 min"
            onChange={(e) => set({ limits: e.target.value })}
          />
        </label>
        <button type="button" onClick={() => onRequest(composeRequest(options))}>
          Montar o pedido
        </button>
      </fieldset>
      <p>
        <label>
          O que você quer nesta ficha?{" "}
          <textarea
            value={request}
            onChange={(e) => onRequest(e.target.value)}
            rows={3}
            placeholder="Ex: treino de costas e bíceps, foco em volume, 12 séries efetivas de costas na semana..."
          />
        </label>
      </p>
    </>
  );
}
