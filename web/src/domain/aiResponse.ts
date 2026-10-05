import type { Exercise } from "./exercise";
import { kotlinTrim, toIntOrNull } from "./kotlin";
import type { ParsedWorkout, ParsedWorkouts } from "./workoutParser";

// GOALS.md §25i — Gemini answers in JSON (a response schema keeps it that way), and this turns that
// JSON into the SAME `ParsedWorkout[]` the pasted-text splitter produces, so one review screen serves
// both ways of asking. Pure and forgiving: a model can return a missing field or a stray type, and a
// half-usable answer should still reach the trainer, with a note, rather than fail whole.
//
// The shape (see data/gemini.ts for the matching response schema):
//   { treinos: [{ nome, exercicios: [{ nome, series, reps }] }] }
// `ativacao` is tolerated below only for older/stubbed replies; the current schema leaves it to the catalog.

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown): string {
  return typeof value === "string" ? kotlinTrim(value) : typeof value === "number" ? String(value) : "";
}

function wholeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : Math.round(value);
  return typeof value === "string" ? toIntOrNull(kotlinTrim(value)) : null;
}

/** [{ musculo, coeficiente }] → { musculo: coeficiente }; null when nothing usable. */
function activation(value: unknown): Record<string, number> | null {
  if (!Array.isArray(value)) return null;
  const pairs = new Map<string, number>();
  for (const item of value) {
    if (!isObject(item)) continue;
    const muscle = text(item.musculo);
    const coefficient = typeof item.coeficiente === "number" ? item.coeficiente : Number.NaN;
    if (muscle === "" || !Number.isFinite(coefficient) || coefficient < 0 || coefficient > 1) continue;
    pairs.set(muscle, coefficient);
  }
  // fromEntries, not bracket assignment: a muscle named "__proto__" must stay a plain key.
  return pairs.size === 0 ? null : Object.fromEntries(pairs);
}

/** Parses the model's JSON text (or an already-parsed value) into treinos, with warnings. */
export function treinosFromAi(raw: unknown): ParsedWorkouts {
  const warnings: string[] = [];
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { workouts: [], warnings: ["A resposta do Gemini não veio no formato esperado."] };
    }
  }
  const list = isObject(data) && Array.isArray(data.treinos) ? data.treinos : null;
  if (list === null) return { workouts: [], warnings: ["A resposta do Gemini não trouxe treinos."] };

  const workouts: ParsedWorkout[] = [];
  list.forEach((treino, index) => {
    if (!isObject(treino)) return;
    const name = text(treino.nome) || `Treino ${index + 1}`;
    const exercises: Exercise[] = [];
    for (const item of Array.isArray(treino.exercicios) ? treino.exercicios : []) {
      if (!isObject(item)) continue;
      const exerciseName = text(item.nome);
      const sets = wholeNumber(item.series);
      if (exerciseName === "" || sets === null || sets <= 0) {
        if (exerciseName !== "")
          warnings.push(`${name}: “${exerciseName}” veio sem número de séries válido e foi ignorado.`);
        continue;
      }
      exercises.push({
        name: exerciseName,
        sets,
        reps: text(item.reps),
        weight: null,
        restSeconds: null,
        notes: null,
        muscleActivation: activation(item.ativacao),
      });
    }
    if (exercises.length === 0) {
      warnings.push(`${name} não tem exercícios e foi ignorado.`);
      return;
    }
    workouts.push({ name, exercises });
  });
  return { workouts, warnings };
}
