import type { Exercise } from "./exercise";
import { JAVA_REGEX_SPACE, kotlinLines, kotlinTrim, toDoubleOrNull, toIntOrNull } from "./kotlin";

// GOALS.md §23e — "Smart Paste": a port of shared/.../util/WorkoutParser.kt, which is the reference
// (CLAUDE.md has the format). The phone parses the same pasted text, so the two must agree on it;
// WorkoutParserTest.kt's cases are ported one for one in workoutParser.test.ts.
//
// Copying the Kotlin regexes literally would have silently changed two of them. Java's `[^]]`
// means "anything but ]" — in JavaScript `[^]` is "any character", so the annotation regex is
// written `[^\]]` here. And Java's `\s` is ASCII-only while JavaScript's also matches the
// no-break space WhatsApp puts into copied text; JAVA_REGEX_SPACE keeps the phone's behaviour, so
// a line the phone skips is skipped here too.

const S = JAVA_REGEX_SPACE;
const NAME_PATTERN = new RegExp(`(Ficha|Treino|Dia)${S}+([A-Ga-g1-7])`, "i");
const EXERCISE_PATTERN = new RegExp(`(.+?)${S}+(\\d+)${S}*[xX]${S}*([\\d-]+)`);
// A trailing per-exercise annotation, e.g. "Supino reto 4x10 [Peitoral:1.0, Delt.ant:0.5]" — the
// format the §15 prompt asks the AI for. Absent is fine; malformed is skipped, never an error.
const ANNOTATION_PATTERN = /\[([^\]]+)\]/;

/** The first "Ficha A" / "Treino b" / "Dia 1" found in the text, or null. */
export function parseWorkoutName(text: string): string | null {
  for (const line of kotlinLines(text)) {
    const match = NAME_PATTERN.exec(line);
    if (match) return kotlinTrim(match[0]);
  }
  return null;
}

/**
 * Every line shaped like "Supino 3x12", "Biceps 12x4" or "Agachamento 4 x 10-12"; other lines are
 * skipped, since pasted text is expected to be messy.
 *
 * The smaller of the two numbers is the set count, whichever side of the "x" it's on — so the
 * sets-first "Supino 3x12" and the reps-first "Biceps 12x4" a trainer might paste mean the same
 * thing. Deliberate; don't "fix" it into "first number = sets".
 */
export function parseExercises(text: string): Exercise[] {
  const exercises: Exercise[] = [];
  for (const line of kotlinLines(text)) {
    const exercise = exerciseFromLine(kotlinTrim(line));
    if (exercise !== null) exercises.push(exercise);
  }
  return exercises;
}

/** One already-trimmed line as an exercise, or null — the rule parseExercises applies per line. */
function exerciseFromLine(trimmed: string): Exercise | null {
  if (trimmed === "") return null;
  const match = EXERCISE_PATTERN.exec(trimmed);
  if (!match) return null;

  const name = kotlinTrim(match[1]);
  const partA = kotlinTrim(match[2]);
  const partB = kotlinTrim(match[3]);
  // "10-12" isn't an Int, so a rep range reads as 0 here — exactly as on the phone.
  const numA = toIntOrNull(partA) ?? 0;
  const numB = toIntOrNull(partB) ?? 0;

  let sets: number;
  let reps: string;
  if (numA < numB && numA > 0) {
    [sets, reps] = [numA, partB]; // 3x12: 3 sets of 12
  } else if (numB < numA && numB > 0) {
    [sets, reps] = [numB, partA]; // 12x4: 4 sets of 12
  } else if (numA <= 10 && numA > 0) {
    [sets, reps] = [numA, partB]; // 4 x 10-12: a small first number is the set count
  } else {
    [sets, reps] = [numB, partA];
  }

  if (name === "" || sets <= 0) return null;
  return { name, sets, reps, weight: null, restSeconds: null, notes: null, muscleActivation: parseMuscleActivation(trimmed) };
}

// ---------------------------------------------------------------------------------------------
// GOALS.md §25d — several treinos in one pasted answer. WEB-ONLY: the phone's paste still reads one
// ficha at a time, so none of the functions above is changed; this is added beside them. Stored
// documents are identical either way (one `workouts/{id}` per treino).

export interface ParsedWorkout {
  name: string;
  exercises: Exercise[];
}

export interface ParsedWorkouts {
  workouts: ParsedWorkout[];
  /** Plain-language notes for the trainer ("Treino C não tem exercícios e foi ignorado."). */
  warnings: string[];
}

// What chat apps put in front of a line despite being asked not to: "#", ">", "*", "-", "•",
// "1." / "1)". Stripped only on the new path, so a header like "## **Treino A**" is still a header.
const LINE_DECORATION = new RegExp(`^(?:${S}|[#>*_•·\\-–—]|\\d{1,2}[.)](?=${S}))+`);
// "Treino A", "Ficha b — Pernas", "Dia 3: Costas". The letter must end the word, so "Treino
// Abdominal" is not "Treino A".
const HEADER_PATTERN = new RegExp(`^(Ficha|Treino|Dia)${S}+([A-Ga-g1-7])(?![\\p{L}\\p{N}])(.*)$`, "iu");
const MAX_NAME_LENGTH = 60;
const SUSPICIOUS_TREINO_COUNT = 7;

const HEADER_WORDS: Record<string, string> = { ficha: "Ficha", treino: "Treino", dia: "Dia" };

function stripDecoration(line: string): string {
  return kotlinTrim(line.replace(LINE_DECORATION, "").replace(/[*`]|__/g, ""));
}

/** "Treino A — Peito e tríceps" from the header's pieces; no subtitle is just "Treino A". */
function headerName(word: string, id: string, rest: string): string {
  const base = `${HEADER_WORDS[word.toLowerCase()]} ${id.toUpperCase()}`;
  const subtitle = kotlinTrim(rest.replace(/^[\s:–—\-·|.)(]+/u, "").replace(/[\s:–—\-·|.)(]+$/u, ""));
  return subtitle === "" ? base : `${base} — ${subtitle}`.slice(0, MAX_NAME_LENGTH);
}

/** A name not used yet: the second "Treino A" becomes "Treino A (2)". */
function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Splits a pasted answer into one treino per header ("Treino A", "Ficha B — Costas", "Dia 3"),
 * keeping every exercise line of `parseExercises` in the treino it sits under. A line with an NxM is
 * an exercise even if it starts like a header (the exercise rule wins, as `Dia 1 3x10` shows); other
 * lines — chatter, markdown rules, code fences — are ignored. A paste from a spreadsheet (every line
 * has tab-separated treino, exercise, sets, reps) is grouped by its first column instead.
 *
 * Text with no header is one treino holding every exercise, so a plain paste behaves as before.
 */
export function parseWorkouts(text: string): ParsedWorkouts {
  const tabular = parseTabular(text);
  if (tabular !== null) return finish(tabular.groups, tabular.warnings);

  const groups: { name: string; exercises: Exercise[] }[] = [];
  const warnings: string[] = [];
  let current: { name: string; exercises: Exercise[] } | null = null;
  let before: { name: string; exercises: Exercise[] } | null = null;

  for (const line of kotlinLines(text)) {
    const cleaned = stripDecoration(line);
    const exercise = exerciseFromLine(cleaned);
    if (exercise !== null) {
      if (current === null) {
        before = { name: "Treino 1", exercises: [] };
        current = before;
        groups.push(current);
      }
      current.exercises.push(exercise);
      continue;
    }
    const header = HEADER_PATTERN.exec(cleaned);
    if (header) {
      current = { name: headerName(header[1], header[2], header[3]), exercises: [] };
      groups.push(current);
    }
  }
  if (before !== null && groups.length > 1) {
    warnings.push("Havia exercícios antes do primeiro título; ficaram em “Treino 1”.");
  }
  return finish(groups, warnings);
}

function finish(groups: { name: string; exercises: Exercise[] }[], warnings: string[]): ParsedWorkouts {
  const taken = new Set<string>();
  const workouts: ParsedWorkout[] = [];
  for (const group of groups) {
    if (group.exercises.length === 0) {
      warnings.push(`${group.name} não tem exercícios e foi ignorado.`);
      continue;
    }
    workouts.push({ name: uniqueName(group.name, taken), exercises: group.exercises });
  }
  if (workouts.length > SUSPICIOUS_TREINO_COUNT) {
    warnings.push(`Foram encontrados ${workouts.length} treinos — confira se a separação está certa.`);
  }
  return { workouts, warnings };
}

/**
 * "Treino ⇥ Exercício ⇥ Séries ⇥ Reps" rows, as pasted from Excel or Google Sheets. Only taken when
 * EVERY non-empty line has at least three tab-separated cells and at least one has a whole-number
 * sets cell — so an ordinary line that happens to contain a tab never switches the mode. A header
 * row (non-numeric sets cell) is skipped.
 */
function parseTabular(text: string): { groups: { name: string; exercises: Exercise[] }[]; warnings: string[] } | null {
  const rows = kotlinLines(text)
    .map((line) => line.split("\t").map((cell) => kotlinTrim(cell)))
    .filter((cells) => cells.some((cell) => cell !== ""));
  if (rows.length === 0 || !rows.every((cells) => cells.length >= 3 && cells[0] !== "" && cells[1] !== "")) return null;
  if (!rows.some((cells) => /^\d+$/.test(cells[2]))) return null;

  const groups = new Map<string, { name: string; exercises: Exercise[] }>();
  for (const cells of rows) {
    const sets = /^\d+$/.test(cells[2]) ? Number(cells[2]) : 0;
    if (sets <= 0) continue; // the header row, or a row with no usable sets
    const key = cells[0].toLowerCase();
    let group = groups.get(key);
    if (!group) {
      // "A" or "2" alone is a treino letter/number; anything longer is already a name.
      group = { name: /^[A-Ga-g1-7]$/.test(cells[0]) ? `Treino ${cells[0].toUpperCase()}` : cells[0], exercises: [] };
      groups.set(key, group);
    }
    group.exercises.push({
      name: cells[1],
      sets,
      reps: cells[3] ?? "",
      weight: null,
      restSeconds: null,
      notes: null,
      muscleActivation: null,
    });
  }
  return { groups: [...groups.values()], warnings: [] };
}

// Coefficients use a period: the muscle list itself is comma-separated, so "0,5" would be
// ambiguous with the next entry. The prompt template tells the AI so; a comma decimal is a
// malformed entry and is skipped.
function parseMuscleActivation(line: string): Record<string, number> | null {
  const match = ANNOTATION_PATTERN.exec(line);
  if (!match) return null;
  const pairs = new Map<string, number>();
  for (const part of match[1].split(",")) {
    const keyValue = part.split(":");
    if (keyValue.length !== 2) continue;
    const muscle = kotlinTrim(keyValue[0]);
    const coefficient = toDoubleOrNull(kotlinTrim(keyValue[1]));
    if (coefficient === null || muscle === "") continue;
    pairs.set(muscle, coefficient);
  }
  // fromEntries, not bracket assignment: a muscle named "__proto__" must stay a plain key.
  return pairs.size === 0 ? null : Object.fromEntries(pairs);
}

/**
 * Effective weekly volume per muscle: Σ(sets × activation coefficient) over every exercise that
 * annotates that muscle — fractional counting of indirect sets, the method with the strongest
 * evidence in the 2025 dose-response meta-regression the Kotlin side cites (REPERTOIRE.md §1).
 * Exercises without an annotation contribute nothing.
 */
export function calculateEffectiveVolume(exercises: readonly Exercise[]): Record<string, number> {
  const totals = new Map<string, number>();
  for (const exercise of exercises) {
    if (!exercise.muscleActivation) continue;
    for (const [muscle, coefficient] of Object.entries(exercise.muscleActivation)) {
      totals.set(muscle, (totals.get(muscle) ?? 0) + exercise.sets * coefficient);
    }
  }
  return Object.fromEntries(totals);
}
