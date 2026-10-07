import type { Exercise } from "./exercise";
import { applyCatalogActivations, type ExerciseCatalog } from "./exerciseCatalog";
import { IDEAL_FROM, IDEAL_TO, MINIMUM, volumeBand } from "./volumeBands";
import { calculateEffectiveVolume } from "./workoutParser";

// GOALS.md §33e — the loop that replaces the AI doing the table's arithmetic. The AI no longer sees the
// reference table, so the site (which still has it, behind the gate) adds up each muscle's effective sets and,
// when the trainer asks, sends the AI back a short summary of where the week landed. Only muscle labels, totals
// and band words go out — never an exercise's row, never a coefficient — so the AI can rebalance without ever
// holding the reference.

const SETS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** The week's effective sets per muscle across the ficha's treinos, with the catalog's muscles filled in. */
export function includedVolume(
  items: ReadonlyArray<{ exercises: readonly Exercise[] }>,
  catalog: ExerciseCatalog | null,
): Record<string, number> {
  const exercises = items.flatMap((item) => (catalog ? applyCatalogActivations(item.exercises, catalog) : [...item.exercises]));
  return calculateEffectiveVolume(exercises);
}

/**
 * One pt-BR message listing the muscles whose weekly effective volume is above the ideal range, or between the
 * minimum and the ideal range, and asking for the whole ficha back adjusted; null when nothing needs adjusting.
 * Muscles under the minimum are left out on purpose: that is incidental work (a helper muscle of another lift),
 * not a muscle the plan is trying to train, and asking to raise it would distort the ficha.
 */
export function buildVolumeAdjustMessage(volume: Readonly<Record<string, number>>): string | null {
  const lines = Object.entries(volume)
    .filter(([, sets]) => sets >= MINIMUM)
    .map(([muscle, sets]) => ({ muscle, sets, band: volumeBand(sets).band }))
    .filter((line) => line.band === "building" || line.band === "above")
    .sort((a, b) => a.muscle.localeCompare(b.muscle, "pt-BR"))
    .map(
      (line) =>
        `- ${line.muscle}: ${SETS.format(line.sets)} séries efetivas por semana — ${
          line.band === "above" ? "acima" : "abaixo"
        } da faixa ideal (${IDEAL_FROM}–${IDEAL_TO})`,
    );
  if (lines.length === 0) return null;
  return [
    "Resumo do volume semanal por músculo (séries efetivas, somando todos os treinos da ficha):",
    ...lines,
    `Ajuste as séries dos treinos para levar esses músculos à faixa de ${IDEAL_FROM}–${IDEAL_TO} séries por semana, ` +
      "sem mexer no que já está dentro dela, e devolva a ficha COMPLETA e atualizada, no mesmo formato.",
  ].join("\n");
}
