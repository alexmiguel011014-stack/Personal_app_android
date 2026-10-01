// GOALS.md §25f — the quick picks above "O que você quer nesta ficha?": a few choices that compose
// the request text, which stays editable (nothing is hidden behind them). Pure; the editor owns the
// state. The titles are always "Treino A, B…" because that is what the splitter (parseWorkouts)
// recognises, whatever the split is called.

export type SplitId = "" | "abc" | "abcd" | "abcde" | "upper-lower" | "ppl" | "full-body";

export interface SplitChoice {
  id: SplitId;
  label: string;
  /** How many treinos the split implies; null when it depends on the days. */
  treinos: number | null;
  /** Said to the AI after the count. */
  hint: string;
}

export const SPLITS: readonly SplitChoice[] = [
  { id: "", label: "Deixe a IA escolher", treinos: null, hint: "" },
  { id: "abc", label: "ABC", treinos: 3, hint: "divisão ABC" },
  { id: "abcd", label: "ABCD", treinos: 4, hint: "divisão ABCD" },
  { id: "abcde", label: "ABCDE", treinos: 5, hint: "divisão ABCDE" },
  {
    id: "upper-lower",
    label: "Superior / Inferior",
    treinos: 4,
    hint: "divisão superior/inferior (dois treinos de cada)",
  },
  { id: "ppl", label: "Push / Pull / Legs", treinos: 3, hint: "divisão push/pull/legs" },
  { id: "full-body", label: "Corpo inteiro", treinos: null, hint: "treinos de corpo inteiro" },
];

export interface RequestOptions {
  /** Number of treinos; null = let the AI decide. */
  treinos: number | null;
  split: SplitId;
  weeklyTarget: string;
  emphasis: string;
  limits: string;
}

export const DEFAULT_WEEKLY_TARGET = "12–20 séries efetivas por semana por grupo muscular";

export const EMPTY_OPTIONS: RequestOptions = { treinos: null, split: "", weeklyTarget: "", emphasis: "", limits: "" };

/** The days a student trains, as a sensible default for the number of treinos (1–6, else null). */
export function defaultTreinos(trainingDays: readonly string[]): number | null {
  return trainingDays.length >= 1 && trainingDays.length <= 6 ? trainingDays.length : null;
}

const LETTERS = "ABCDEFG";

/** "Treino A, Treino B e Treino C" */
function titles(count: number): string {
  const names = Array.from({ length: Math.min(count, LETTERS.length) }, (_, i) => `Treino ${LETTERS[i]}`);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

/** The request text for the options; empty options give an empty request (today's behaviour). */
export function composeRequest(options: RequestOptions): string {
  const split = SPLITS.find((s) => s.id === options.split);
  const count = options.treinos ?? split?.treinos ?? null;
  const parts: string[] = [];
  if (count !== null) {
    const hint = split && split.hint !== "" ? `, ${split.hint}` : "";
    parts.push(
      `Monte ${count} ${count === 1 ? "treino" : "treinos"} (${titles(count)})${hint}, todos na mesma resposta.`,
    );
  } else if (split && split.hint !== "") {
    parts.push(`Use ${split.hint}, com um treino por dia de treino do aluno, todos na mesma resposta.`);
  }
  if (options.weeklyTarget.trim() !== "") parts.push(`Volume semanal alvo: ${options.weeklyTarget.trim()}.`);
  if (options.emphasis.trim() !== "") parts.push(`Ênfase: ${options.emphasis.trim()}.`);
  if (options.limits.trim() !== "") parts.push(`Limites: ${options.limits.trim()}.`);
  return parts.join(" ");
}
