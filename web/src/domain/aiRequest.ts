import { buildFichaPrompt, deidentified, type PromptStudent } from "./fichaPrompt";

// GOALS.md §25i — the message sent to Gemini. The stable part (rules + the reference table) goes in
// the system instruction; this is the part that changes: the student and the request.
//
// Privacy, on purpose: on Google's free Gemini tier "content used to improve our products" applies
// (https://ai.google.dev/gemini-api/docs/pricing), and a student's name and medical notes are the two
// fields that identify or expose them. So by default they are NOT sent — sex, goal, level and training
// days are enough to build a ficha. Sending them is the trainer's explicit choice.

export const DEFAULT_REQUEST = "Monte a ficha adequada ao perfil do aluno.";

export function buildAiUserMessage(student: PromptStudent | null, request: string, includePersonal: boolean): string {
  const who = student !== null && !includePersonal ? deidentified(student) : student;
  const wanted = request.trim() === "" ? DEFAULT_REQUEST : request.trim();
  // The same profile block and "Pedido do Professor" line the copy-paste prompt uses, with no template.
  return buildFichaPrompt("", "", who, wanted).trim();
}

/** The follow-up turn: the whole ficha is asked back, so the review always shows every treino. */
export function buildAdjustMessage(instruction: string): string {
  return `Ajuste pedido pelo personal: ${instruction.trim()}\nDevolva a ficha COMPLETA e atualizada (todos os treinos), no mesmo formato.`;
}
