// GOALS.md §25e: the generic weekly-volume bands the ficha prompt already states (and
// REPERTOIRE.md §2 grounds): ~4–8 effective sets a week per muscle is the least that works, ~12–20 is
// the ideal range, beyond that fatigue outpaces gain for most people. A bare number means little, so
// the review screen shows each muscle's total next to where it falls — in words, never colour alone.

export type VolumeBand = "below" | "building" | "ideal" | "above";

export const IDEAL_FROM = 12;
export const IDEAL_TO = 20;
export const MINIMUM = 4;

export function volumeBand(effectiveSets: number): { band: VolumeBand; label: string } {
  if (effectiveSets < MINIMUM) return { band: "below", label: "abaixo do mínimo eficaz (4)" };
  if (effectiveSets < IDEAL_FROM) return { band: "building", label: "acima do mínimo, abaixo da faixa ideal (12–20)" };
  if (effectiveSets <= IDEAL_TO) return { band: "ideal", label: "na faixa ideal (12–20)" };
  return { band: "above", label: "acima da faixa ideal (20)" };
}
