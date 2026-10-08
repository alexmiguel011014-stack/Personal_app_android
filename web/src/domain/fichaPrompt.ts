import { kotlinTrimIndent } from "./kotlin";

// GOALS.md §23e — the §15 "prompt-template + paste" flow, which is how fichas get AI help on the
// web (decided 2026-09-24: no AI provider key ever reaches the browser). A port of
// PromptFichaViewModel.buildPrompt: the trainer copies this prompt into whichever AI app they
// already use and pastes the reply back into Smart Paste (workoutParser.ts).
//
// This function mirrors the PHONE's prompt (the template and the table it splices in are Android assets). It is kept
// for parity and for its test, which reads those assets from the repository. The web itself builds no prompt any more:
// it offers one static "Prompt de formatação de ficha" (web/prompt/, GOALS.md §34), and never puts the table in front
// of anyone (§33).

export const TABLE_PLACEHOLDER = "$TABLE_PLACEHOLDER$";

/** The student fields the prompt shows — a subset of every student shape in this app. */
export interface PromptStudent {
  name: string;
  gender: string;
  goal: string;
  experienceLevel: string;
  medicalNotes: string;
  trainingDays: readonly string[];
}

// The Kotlin raw string's indentation in PromptFichaViewModel.kt. It matters because trimIndent()
// runs after interpolation: a multi-line medical note keeps the whole block indented on the phone.
const SOURCE_INDENT = " ".repeat(12);

export function buildFichaPrompt(
  template: string,
  volumeReference: string,
  student: PromptStudent | null,
  request: string,
): string {
  // split/join, not String.replace: a "$&" or "$1" inside the table would be read as a replacement
  // pattern by replace().
  const fullTemplate = template.split(TABLE_PLACEHOLDER).join(volumeReference);
  const profile = student === null ? "" : profileBlock(student);
  return `${fullTemplate}${profile}\n\nPedido do Professor: ${request}`;
}

function profileBlock(student: PromptStudent): string {
  const lines = [
    `Nome: ${student.name}`,
    `Sexo: ${student.gender}`,
    `Objetivo: ${student.goal}`,
    `Nível: ${student.experienceLevel}`,
    `Notas Médicas/Restrições: ${student.medicalNotes}`,
    `Dias de treino na semana: ${student.trainingDays.join(", ")}`,
  ];
  // Rebuilt exactly as the Kotlin raw string is laid out, then trimmed the way Kotlin trims it.
  const raw = `\n${lines.map((line) => SOURCE_INDENT + line).join("\n")}\n${SOURCE_INDENT}`;
  return kotlinTrimIndent(raw);
}
