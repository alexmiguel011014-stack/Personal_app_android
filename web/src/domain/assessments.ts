import type { AnamnesisRecord } from "./anamnesis";

// GOALS.md §23g: a PAR-Q+ self-assessment — Firestore `assessments/{id}`, mirroring AssessmentEntity
// and FirestoreMappers. Written by the student (§23h), append-only, read by their trainer. Goal,
// level and training days are a snapshot of the student's answers when they sent it, not a live
// copy of the profile.
//
// GOALS.md §38g: the web grew it into an anamnese — the same document, with the PAR-Q+ answers where they always
// were and the rest in one web-only map field (`anamnesis`, see domain/anamnesis.ts) plus the consent that came with
// it. A document the phone wrote, or a plain PAR-Q+, has none of those and reads as before.

export interface ParQQuestion {
  key: string;
  text: string;
}

/** ParQ.QUESTIONS, verbatim: the keys are what's stored, the text is what the student answered. */
export const PAR_Q: readonly ParQQuestion[] = [
  {
    key: "heart_condition",
    text: "Algum médico já disse que você tem um problema cardíaco e que só deve fazer atividade física recomendada por um médico?",
  },
  { key: "chest_pain_activity", text: "Você sente dor no peito quando faz atividade física?" },
  {
    key: "chest_pain_rest",
    text: "No último mês, você sentiu dor no peito quando não estava fazendo atividade física?",
  },
  { key: "dizziness", text: "Você perde o equilíbrio por tontura ou já perdeu a consciência?" },
  { key: "bone_joint", text: "Você tem algum problema ósseo ou articular que pode piorar com a atividade física?" },
  { key: "medication", text: "Você toma algum medicamento para pressão arterial ou problema cardíaco?" },
  { key: "other_reason", text: "Você conhece alguma outra razão pela qual não deveria fazer atividade física?" },
];

export interface Assessment {
  id: string;
  studentId: string;
  trainerId: string;
  /** Epoch ms. */
  submittedAt: number;
  /** PAR_Q key → the answer; true is "sim", a flag for the trainer (not a diagnosis). */
  parQAnswers: Record<string, boolean>;
  goal: string;
  experienceLevel: string;
  trainingDays: string[];
  /** GOALS.md §38g: null on a plain PAR-Q+ (the phone's, or one sent before the anamnese existed). */
  anamnesis: AnamnesisRecord | null;
  /** Which wording of the consent the aluno agreed to ("anamnese-v1"); null without an anamnese. */
  consentVersion: string | null;
  /** Epoch ms of the server time they agreed; null without an anamnese. */
  consentAt: number | null;
}

/** The questions answered "sim" — AssessmentEntity.flaggedQuestions. */
export function flaggedQuestions(assessment: Assessment): ParQQuestion[] {
  return PAR_Q.filter((question) => assessment.parQAnswers[question.key] === true);
}

/**
 * A PAR-Q+ being filled in: a question stays unanswered until the person taps "Sim" or "Não". (The phone's form
 * starts with every answer on "Não"; the web does not — one tap on "Enviar" would otherwise record a health screening
 * nobody read. GOALS.md §38c, D10: a stricter-input difference, the stored shape is unchanged.)
 */
export type AnswerDraft = Partial<Record<string, boolean>>;

/** How many of the seven questions still have no answer. */
export function unansweredCount(draft: AnswerDraft): number {
  return PAR_Q.filter((question) => draft[question.key] === undefined).length;
}

/** The answers as they are stored — every question, "sim" as true — or null while any is unanswered. */
export function completeAnswers(draft: AnswerDraft): Record<string, boolean> | null {
  if (unansweredCount(draft) > 0) return null;
  return Object.fromEntries(PAR_Q.map((question) => [question.key, draft[question.key] === true]));
}

/** `parQAnswersJson` as the phone writes it: every question, in the questionnaire's order. */
export function encodeParQAnswers(answers: Readonly<Record<string, boolean>>): string {
  return JSON.stringify(Object.fromEntries(PAR_Q.map((question) => [question.key, answers[question.key] === true])));
}

/**
 * `parQAnswersJson` read as the Kotlin mapper reads it: kotlinx decodes a Map<String, Boolean> or
 * throws, and the mapper turns a throw into an empty map — so anything but an object whose every
 * value is a JSON boolean reads as no answers.
 */
export function decodeParQAnswers(json: string | null): Record<string, boolean> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json ?? "{}");
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const entries = Object.entries(parsed);
  return entries.every(([, answer]) => typeof answer === "boolean") ? Object.fromEntries(entries) : {};
}
