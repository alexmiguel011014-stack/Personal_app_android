import { brazilianNumber } from "./contact";

// GOALS.md §38h (D9): the card a personal may show to their alunos so the aluno can write to them on WhatsApp. Opt-in,
// written only by that personal. Pure.

export interface TrainerContact {
  trainerId: string;
  name: string;
  /** Digits only, "55" + DDD + number. */
  whatsapp: string;
  updatedAt: number | null;
}

export const CONTACT_NAME_MAX = 80;

export type ContactProblem = "name" | "whatsapp";

/** What the personal typed, as the card stores it — or the field that is not acceptable. */
export function checkContactInput(input: { name: string; whatsapp: string }):
  | { ok: true; name: string; whatsapp: string }
  | { ok: false; problem: ContactProblem } {
  const name = input.name.trim();
  if (name.length < 2 || name.length > CONTACT_NAME_MAX || /[\u0000-\u001f\u007f]/.test(name)) return { ok: false, problem: "name" };
  const whatsapp = brazilianNumber(input.whatsapp);
  if (whatsapp === null) return { ok: false, problem: "whatsapp" };
  return { ok: true, name, whatsapp };
}

/** The first name an aluno sees on the "Falar com …" button. */
export function contactFirstName(contact: Pick<TrainerContact, "name">): string {
  return contact.name.trim().split(/\s+/)[0] ?? contact.name;
}
