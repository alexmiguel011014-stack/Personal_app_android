import { kotlinTrimIndent } from "./kotlin";

// GOALS.md §23e — the §15 "prompt-template + paste" flow, which is how fichas get AI help on the
// web (decided 2026-09-24: no AI provider key ever reaches the browser). A port of
// PromptFichaViewModel.buildPrompt: the trainer copies this prompt into whichever AI app they
// already use and pastes the reply back into Smart Paste (workoutParser.ts).
//
// The template and the volume table are app/src/main/assets/ficha_prompt_template.md and
// hypertrophy_volume_reference.md — the same bytes the phone ships (the Android line keeps them
// under composeResources/files/; verified identical 2026-09-24). They're passed in rather than
// imported, so there is still exactly one copy of each in the repo.

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

// ---------------------------------------------------------------------------------------------
// GOALS.md §25f/§33 — the web's own prompts. WEB-ONLY: the phone's template asks for one ficha with a
// muscle block per line, which only makes sense with the reference table in the prompt; the web never
// puts that table in front of a reader or an AI (§33), so its templates (web/prompt/) ask for names and
// sets x reps only, and the site fills in the muscles itself. buildFichaPrompt above, which mirrors the
// phone's, is not changed.

export interface WebPromptOptions {
  /** Send "Aluno" and "não informado" instead of the student's name and medical notes. */
  deidentify?: boolean;
}

/**
 * The student without the two fields that identify or expose them — name and medical notes. When
 * there ARE notes the AI is told they exist (so it stays cautious) without being given their text.
 */
export function deidentified(student: PromptStudent): PromptStudent {
  const hasNotes = student.medicalNotes.trim() !== "";
  return {
    ...student,
    name: "Aluno",
    medicalNotes: hasNotes ? "há restrições registradas pelo personal (texto não enviado por privacidade)" : "não informado",
  };
}

/**
 * A web template (single- or multi-treino) + the student's profile + the request. Refuses a template that
 * still carries the table placeholder: splicing "nothing" into it would hide a regression instead of
 * failing it (GOALS.md §33f).
 */
export function buildWebFichaPrompt(
  template: string,
  student: PromptStudent | null,
  request: string,
  options: WebPromptOptions = {},
): string {
  if (template.includes(TABLE_PLACEHOLDER)) {
    throw new Error("A web prompt template must not carry the table placeholder.");
  }
  const who = student !== null && options.deidentify ? deidentified(student) : student;
  return buildFichaPrompt(template, "", who, request);
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
