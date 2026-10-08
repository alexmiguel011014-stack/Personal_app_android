import type { Exercise } from "./exercise";
import { isKotlinBlank, kotlinTrim } from "./kotlin";
import { exerciseErrors } from "./reviewEdit";
import { workoutErrors, type Workout } from "./workouts";

// GOALS.md §34 — a ficha is a named set of treinos, at most MAX_FICHAS per student. It is stored on each treino as
// the web-only `ficha` map (domain/workouts.ts); this file turns a student's treinos back into fichas and decides what
// a new ficha deletes. Pure: no Firestore, no clock.
//
// Treinos that predate fichas (no `ficha`) are not lost and not migrated: the ACTIVE ones read as ONE virtual ficha,
// "Ficha atual". The INACTIVE ones (the §28 history, drafts, hand-deactivated) are hidden — never listed, never counted,
// never deleted by anything here.

export const MAX_FICHAS = 2;
export const LEGACY_FICHA_ID = "legacy";
export const LEGACY_FICHA_NAME = "Ficha atual";
export const MAX_FICHA_NAME_LENGTH = 80;

export interface Ficha {
  /** The shared `ficha.id`; `LEGACY_FICHA_ID` for the virtual one. */
  id: string;
  name: string;
  /** What decides "the oldest": fixed when the ficha is created, unchanged by editing. */
  createdAt: number;
  /** The card's "modificada em" date. */
  updatedAt: number;
  legacy: boolean;
  /** In the order the trainer saved them (legacy: by name, as the student's page always did). */
  treinos: Workout[];
}

const byName = (a: Workout, b: Workout) => a.name.localeCompare(b.name, "pt-BR", { numeric: true });

function byPlace(a: Workout, b: Workout): number {
  return (a.ficha?.order ?? 0) - (b.ficha?.order ?? 0) || a.createdAt - b.createdAt || byName(a, b);
}

/**
 * One student's treinos as fichas, newest first (`createdAt` descending, the id breaks a tie). Real fichas are the
 * treinos sharing `ficha.id` whatever their `isActive`; the virtual one is the active treinos with no `ficha`.
 */
export function groupFichas(workouts: readonly Workout[]): Ficha[] {
  const real = new Map<string, Workout[]>();
  const legacy: Workout[] = [];
  for (const workout of workouts) {
    if (workout.ficha !== null) {
      const members = real.get(workout.ficha.id);
      if (members) members.push(workout);
      else real.set(workout.ficha.id, [workout]);
    } else if (workout.isActive) {
      legacy.push(workout);
    }
  }

  const fichas: Ficha[] = [];
  for (const [id, members] of real) {
    const treinos = [...members].sort(byPlace);
    // The name of the member saved last (the first of them if several share the moment).
    const latest = treinos.reduce((best, treino) => (treino.ficha!.updatedAt > best.ficha!.updatedAt ? treino : best));
    fichas.push({
      id,
      name: latest.ficha!.name,
      createdAt: Math.min(...treinos.map((treino) => treino.ficha!.createdAt)),
      updatedAt: Math.max(...treinos.map((treino) => treino.ficha!.updatedAt)),
      legacy: false,
      treinos,
    });
  }
  if (legacy.length > 0) {
    fichas.push({
      id: LEGACY_FICHA_ID,
      name: LEGACY_FICHA_NAME,
      createdAt: Math.min(...legacy.map((treino) => treino.createdAt)),
      updatedAt: Math.max(...legacy.map((treino) => treino.assignedAt ?? treino.createdAt)),
      legacy: true,
      treinos: [...legacy].sort(byName),
    });
  }
  return fichas.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export interface NewFichaPlan {
  /** The new ficha's treinos, as given. */
  toCreate: Workout[];
  /** Every treino of the fichas that no longer fit — the oldest ones, nothing else. */
  toDelete: Workout[];
}

/**
 * What saving a NEW ficha does to a student that already has `existing` treinos: it keeps the newest
 * `MAX_FICHAS - 1` fichas and deletes every treino of the rest. It only ever sees one student's treinos (the caller
 * loads them with both equality filters) and never lists a hidden legacy treino for deletion.
 */
export function planNewFicha(existing: readonly Workout[], incoming: readonly Workout[]): NewFichaPlan {
  const toDelete = groupFichas(existing)
    .slice(MAX_FICHAS - 1)
    .flatMap((ficha) => ficha.treinos);
  const toCreate = [...incoming];

  // A treino in two lists would be written and deleted in the same batch: a bug, never a case to handle.
  const seen = new Set<string>();
  for (const workout of [...toCreate, ...toDelete]) {
    if (seen.has(workout.id)) throw new Error(`Treino ${workout.id} is in more than one list of the new ficha.`);
    seen.add(workout.id);
  }
  return { toCreate, toDelete };
}

export function fichaNameErrors(name: string): string[] {
  if (isKotlinBlank(name)) return ["Nome da ficha é obrigatório."];
  if (kotlinTrim(name).length > MAX_FICHA_NAME_LENGTH) {
    return [`Nome da ficha: no máximo ${MAX_FICHA_NAME_LENGTH} caracteres.`];
  }
  return [];
}

/** Everything a ficha must satisfy before it is saved, in the trainer's words; empty means it can be saved. */
export function fichaSaveErrors(
  name: string,
  treinos: readonly { name: string; exercises: readonly Exercise[] }[],
): string[] {
  const errors = [...fichaNameErrors(name)];
  if (treinos.length === 0) errors.push("Adicione pelo menos um treino.");
  for (const treino of treinos) {
    const label = kotlinTrim(treino.name) || "Treino sem nome";
    for (const error of [...workoutErrors(treino.name, treino.exercises), ...exerciseErrors(treino.exercises)]) {
      errors.push(`${label}: ${error}`);
    }
  }
  return errors;
}
