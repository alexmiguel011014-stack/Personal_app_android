import type { Weekday } from "./dates";

// GOALS.md §23g: the student profile a trainer fills in — the fields and the exact stored values of
// the Android AddStudentScreen / EditStudentScreen, because the phone reads what the web writes.

export const GENDERS = ["Masculino", "Feminino"] as const;

/**
 * Stored exactly as the Android form stores them — including the abbreviated "Interm.", which is
 * what that screen writes. A web-only spelling ("Intermediário") would be a value the phone's own
 * picker doesn't know.
 */
export const LEVELS = ["Iniciante", "Interm.", "Avançado"] as const;

/** Display order used by the Android screens (Monday first). */
export const TRAINING_DAYS: readonly Weekday[] = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export interface StudentProfile {
  name: string;
  gender: string;
  phone: string;
  goal: string;
  experienceLevel: string;
  medicalNotes: string;
  trainingDays: string[];
}

/** The Android form's starting values. */
export function emptyProfile(): StudentProfile {
  return { name: "", gender: "Masculino", phone: "", goal: "", experienceLevel: "Iniciante", medicalNotes: "", trainingDays: [] };
}

/** The Android form's two rules: a name, and at least one training day. */
export function profileErrors(profile: StudentProfile): string[] {
  const errors: string[] = [];
  if (profile.name.trim() === "") errors.push("Informe o nome do aluno.");
  if (profile.trainingDays.length === 0) errors.push("Escolha pelo menos um dia de treino.");
  return errors;
}

/** Trimmed, and training days kept in week order with no duplicates or unknown values. */
export function normalizeProfile(profile: StudentProfile): StudentProfile {
  const days = new Set(profile.trainingDays);
  return {
    name: profile.name.trim(),
    gender: profile.gender,
    phone: profile.phone.trim(),
    goal: profile.goal.trim(),
    experienceLevel: profile.experienceLevel,
    medicalNotes: profile.medicalNotes.trim(),
    trainingDays: TRAINING_DAYS.filter((day) => days.has(day)),
  };
}
