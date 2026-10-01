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
// GOALS.md §25f — the multi-treino prompt. WEB-ONLY: the shared template asks for one ficha and the
// phone's paste would pile several into one, so the web has its own (web/prompt/ficha_prompt_multi.md);
// buildFichaPrompt above, which mirrors the phone's, is not changed.

/** What replaces the reference table when the trainer keeps it in an AI project instead. */
export const SHORT_TABLE_NOTE =
  "(A tabela de referência dos exercícios e das ativações musculares está nos arquivos do meu projeto — " +
  "use-a, com os nomes exatos dos exercícios.)";

export interface MultiPromptOptions {
  /** The table lives in the trainer's own AI project — leave it out and the prompt gets much shorter. */
  shortPrompt?: boolean;
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

export function buildMultiFichaPrompt(
  template: string,
  volumeReference: string,
  student: PromptStudent | null,
  request: string,
  options: MultiPromptOptions = {},
): string {
  const table = options.shortPrompt ? SHORT_TABLE_NOTE : volumeReference;
  const who = student !== null && options.deidentify ? deidentified(student) : student;
  return buildFichaPrompt(template, table, who, request);
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
