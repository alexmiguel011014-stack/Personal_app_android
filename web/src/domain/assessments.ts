// GOALS.md §23g: a PAR-Q+ self-assessment — Firestore `assessments/{id}`, mirroring AssessmentEntity
// and FirestoreMappers. Written by the student (§23h), append-only, read by their trainer. Goal,
// level and training days are a snapshot of the student's answers when they sent it, not a live
// copy of the profile.

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
}

/** The questions answered "sim" — AssessmentEntity.flaggedQuestions. */
export function flaggedQuestions(assessment: Assessment): ParQQuestion[] {
  return PAR_Q.filter((question) => assessment.parQAnswers[question.key] === true);
}

/** Every question answered "Não" — how the phone's form starts. */
export function emptyAnswers(): Record<string, boolean> {
  return Object.fromEntries(PAR_Q.map((question) => [question.key, false]));
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
