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
    const trimmed = kotlinTrim(line);
    if (trimmed === "") continue;
    const match = EXERCISE_PATTERN.exec(trimmed);
    if (!match) continue;

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

    if (name !== "" && sets > 0) {
      exercises.push({
        name,
        sets,
        reps,
        weight: null,
        restSeconds: null,
        notes: null,
        muscleActivation: parseMuscleActivation(trimmed),
      });
    }
  }
  return exercises;
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
