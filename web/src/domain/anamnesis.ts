import { PAR_Q, type AnswerDraft } from "./assessments";
import { LEVELS, TRAINING_DAYS, type StudentProfile } from "./studentProfile";

// GOALS.md §38g — the anamnese: the health history a personal asks an aluno for before prescribing. It grows the
// existing PAR-Q+ self-assessment (the same `assessments/{id}` document, the same request flag, the same permission):
// the PAR-Q+ answers keep their stored place, and everything else lives in one web-only map field, `anamnesis`, that
// the phone ignores. This module is the questionnaire as data plus the rules around it — what is asked, when, what
// counts as answered, what the personal must look at first, what changed since last time — with no Firebase and no
// clock (the current year is an argument). The screens only lay it out.

export const ANAMNESIS_VERSION = 1;

/** The text the aluno agrees to is versioned: a change of wording is a new version, never an edit in place. */
export const CONSENT_VERSION = "anamnese-v1";
export const CONSENT_HEALTH_TEXT =
  "Autorizo meu personal a usar estas informações de saúde apenas para avaliar, planejar e acompanhar meus treinos.";
export const CONSENT_TRUTH_TEXT = "As informações que respondi são verdadeiras.";

/** Shown under the PAR-Q+ as soon as one answer is "Sim" — a reason to talk, not a ban. */
export const PAR_Q_GUIDANCE =
  "Uma resposta “sim” não impede o treino, mas seu personal vai querer conversar com você — e, dependendo do caso, pedir que um profissional de saúde libere você antes de aumentar a intensidade.";

export type SectionId = "prontidao" | "saude" | "habitos" | "rotina" | "objetivos" | "medidas";

export const SECTIONS: readonly { id: SectionId; title: string; intro: string }[] = [
  { id: "prontidao", title: "Prontidão para o exercício", intro: "Sete perguntas padrão, de sim ou não. Responda com sinceridade." },
  { id: "saude", title: "Saúde", intro: "Condições, remédios, cirurgias e dores. Isso ajuda a montar um treino seguro." },
  { id: "habitos", title: "Hábitos", intro: "Sono, estresse e rotina de trabalho influenciam muito o treino." },
  { id: "rotina", title: "Experiência e rotina", intro: "O que você já faz e quando consegue treinar." },
  { id: "objetivos", title: "Objetivos", intro: "O que você quer alcançar." },
  { id: "medidas", title: "Medidas", intro: "Opcional. Se não souber, pule." },
];

export const SECTION_TITLE: Record<SectionId, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>;

/** What an answer can be once stored. In a draft a number is still the text the person typed. */
export type AnswerValue = string | string[] | boolean | number;
export type Answers = Partial<Record<string, AnswerValue>>;

/** What the questionnaire needs to know about the person: the profile's sexo, and the current year for the birth year. */
export interface AnamnesisContext {
  gender: string;
  year: number;
}

interface BaseQuestion {
  key: string;
  section: Exclude<SectionId, "prontidao">;
  label: string;
  hint?: string;
  /** Counted as unanswered until given. Optional questions never block "Continuar". */
  required: boolean;
  showIf?: (answers: Answers, context: AnamnesisContext) => boolean;
}

export type Question =
  | (BaseQuestion & { kind: "single"; options: readonly string[] })
  /** `none` is an exclusive option ("Nenhuma delas"): picking it clears the others, picking another clears it. */
  | (BaseQuestion & { kind: "multi"; options: readonly string[]; none?: string })
  | (BaseQuestion & { kind: "yesno" })
  | (BaseQuestion & { kind: "text"; maxLength: number; multiline?: boolean })
  | (BaseQuestion & { kind: "number"; unit: string; integer: boolean; range: (context: AnamnesisContext) => [number, number] });

const CONDITIONS = ["Hipertensão", "Diabetes", "Colesterol alto", "Doença cardíaca", "Asma/bronquite", "Tireoide", "Labirintite/tontura", "Osteoporose", "Hérnia de disco", "Ansiedade/depressão", "Outra"] as const;
const NO_CONDITION = "Nenhuma";
const PAIN_REGIONS = ["Pescoço", "Ombro", "Cotovelo/punho", "Costas (meio)", "Lombar", "Quadril", "Joelho", "Tornozelo/pé"] as const;
const ACTIVITIES = ["Musculação", "Corrida", "Caminhada", "Ciclismo", "Natação", "Lutas", "Esportes coletivos", "Funcional", "Yoga ou pilates", "Dança"] as const;
const NO_ACTIVITY = "Nenhuma no momento";
export const EXPERIENCE = ["Nunca treinei", "Menos de 6 meses", "6 meses a 2 anos", "Mais de 2 anos"] as const;
export const GOALS = ["Hipertrofia", "Emagrecimento", "Condicionamento", "Saúde e qualidade de vida", "Força", "Reduzir dores", "Performance esportiva"] as const;
const SLEEP_SHORT = "Menos de 5 h";

const isYes = (value: AnswerValue | undefined) => value === true;
const includes = (value: AnswerValue | undefined, option: string) => Array.isArray(value) && value.includes(option);

export const QUESTIONS: readonly Question[] = [
  // ---- Saúde ----
  { key: "conditions", section: "saude", kind: "multi", label: "Você tem ou já teve alguma destas condições?", hint: "Marque todas que se aplicam.", options: [...CONDITIONS, NO_CONDITION], none: NO_CONDITION, required: true },
  { key: "conditions_other", section: "saude", kind: "text", label: "Qual outra condição?", maxLength: 120, required: false, showIf: (a) => includes(a.conditions, "Outra") },
  { key: "medication", section: "saude", kind: "yesno", label: "Usa algum medicamento de uso contínuo?", required: true },
  { key: "medication_which", section: "saude", kind: "text", label: "Quais?", maxLength: 200, required: false, showIf: (a) => isYes(a.medication) },
  { key: "surgery", section: "saude", kind: "yesno", label: "Já fez alguma cirurgia?", required: true },
  { key: "surgery_which", section: "saude", kind: "text", label: "Qual, e quando?", maxLength: 200, required: false, showIf: (a) => isYes(a.surgery) },
  { key: "pain", section: "saude", kind: "yesno", label: "Sente dor ou tem alguma lesão hoje?", required: true },
  { key: "pain_regions", section: "saude", kind: "multi", label: "Onde?", hint: "Marque todas as regiões.", options: PAIN_REGIONS, required: true, showIf: (a) => isYes(a.pain) },
  { key: "pain_worse", section: "saude", kind: "yesno", label: "A dor piora quando você se movimenta?", required: true, showIf: (a) => isYes(a.pain) },
  { key: "pregnancy", section: "saude", kind: "yesno", label: "Está gestante ou teve bebê nos últimos 12 meses?", required: true, showIf: (_a, c) => c.gender !== "Masculino" },
  // ---- Hábitos ----
  { key: "smoking", section: "habitos", kind: "single", label: "Você fuma?", options: ["Não", "Sim", "Parei"], required: true },
  { key: "alcohol", section: "habitos", kind: "single", label: "Bebe álcool?", options: ["Nunca", "Às vezes", "Toda semana", "Quase todo dia"], required: true },
  { key: "sleep_hours", section: "habitos", kind: "single", label: "Quantas horas dorme por noite, em média?", options: [SLEEP_SHORT, "5 a 6 h", "7 a 8 h", "Mais de 8 h"], required: true },
  { key: "sleep_quality", section: "habitos", kind: "single", label: "Como é a qualidade do seu sono?", options: ["Ruim", "Regular", "Boa"], required: true },
  { key: "stress", section: "habitos", kind: "single", label: "Como está seu nível de estresse?", options: ["Baixo", "Médio", "Alto"], required: true },
  { key: "work", section: "habitos", kind: "single", label: "No trabalho, você passa a maior parte do tempo…", options: ["Sentado", "Em pé", "Em trabalho braçal"], required: true },
  // ---- Experiência e rotina ----
  { key: "experience", section: "rotina", kind: "single", label: "Há quanto tempo você treina com regularidade?", options: EXPERIENCE, required: true },
  { key: "activities", section: "rotina", kind: "multi", label: "O que você pratica hoje?", hint: "Marque todas.", options: [...ACTIVITIES, NO_ACTIVITY], none: NO_ACTIVITY, required: true },
  { key: "days", section: "rotina", kind: "multi", label: "Em quais dias você pode treinar?", options: TRAINING_DAYS, required: true },
  { key: "session_minutes", section: "rotina", kind: "single", label: "Quanto tempo tem por treino?", options: ["30 min", "45 min", "60 min", "90 min"], required: true },
  { key: "place", section: "rotina", kind: "single", label: "Onde vai treinar?", options: ["Academia", "Casa", "Condomínio", "Ao ar livre"], required: true },
  // ---- Objetivos ----
  { key: "goal", section: "objetivos", kind: "single", label: "Qual é o seu objetivo principal?", options: GOALS, required: true },
  { key: "horizon", section: "objetivos", kind: "single", label: "Em quanto tempo quer ver resultado?", options: ["Sem pressa", "3 meses", "6 meses", "1 ano"], required: true },
  { key: "dislikes", section: "objetivos", kind: "text", label: "Algum exercício que você não gosta ou não pode fazer?", maxLength: 200, required: false },
  { key: "notes", section: "objetivos", kind: "text", label: "O que mais seu personal deveria saber?", maxLength: 500, multiline: true, required: false },
  // ---- Medidas (all optional) ----
  { key: "birth_year", section: "medidas", kind: "number", label: "Ano de nascimento", unit: "", integer: true, range: (c) => [1920, c.year - 5], required: false },
  { key: "weight_kg", section: "medidas", kind: "number", label: "Peso", unit: "kg", integer: false, range: () => [20, 400], required: false },
  { key: "height_cm", section: "medidas", kind: "number", label: "Altura", unit: "cm", integer: true, range: () => [100, 250], required: false },
];

const QUESTION_BY_KEY = new Map(QUESTIONS.map((q) => [q.key, q]));
export const questionOf = (key: string): Question | undefined => QUESTION_BY_KEY.get(key);

/** The questions of a section that apply to this person, given what they have answered so far. */
export function visibleQuestions(answers: Answers, context: AnamnesisContext, section?: SectionId): Question[] {
  return QUESTIONS.filter((q) => (section === undefined || q.section === section) && (q.showIf === undefined || q.showIf(answers, context)));
}

// ---------- what a person has filled in ----------

export interface AnamnesisDraft {
  parQ: AnswerDraft;
  answers: Answers;
  consentHealth: boolean;
  consentTruth: boolean;
}

export function emptyAnamnesisDraft(): AnamnesisDraft {
  return { parQ: {}, answers: {}, consentHealth: false, consentTruth: false };
}

/** Whether anything was answered — an untouched form is not worth keeping a draft of. */
export function draftHasContent(draft: AnamnesisDraft): boolean {
  return Object.values(draft.parQ).some((answer) => answer !== undefined) || Object.keys(draft.answers).length > 0 || draft.consentHealth || draft.consentTruth;
}

/** A draft as kept on the device: where the person was, and what they had answered. */
export interface DraftSnapshot {
  /** 0–5 are the sections, 6 is the review with the consent. */
  step: number;
  draft: AnamnesisDraft;
}

export const REVIEW_STEP = SECTIONS.length;

/**
 * A draft read back from storage, validated: known questions only, each value in a plausible shape and size. Anything
 * else is dropped, a record that is not one at all gives null.
 */
export function validateDraftSnapshot(data: unknown): DraftSnapshot | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const { step, draft } = data as { step?: unknown; draft?: unknown };
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > REVIEW_STEP) return null;
  if (typeof draft !== "object" || draft === null || Array.isArray(draft)) return null;
  const { parQ, answers, consentHealth, consentTruth } = draft as { parQ?: unknown; answers?: unknown; consentHealth?: unknown; consentTruth?: unknown };
  const clean = emptyAnamnesisDraft();
  if (typeof parQ === "object" && parQ !== null && !Array.isArray(parQ)) {
    for (const question of PAR_Q) {
      const value = (parQ as Record<string, unknown>)[question.key];
      if (typeof value === "boolean") clean.parQ[question.key] = value;
    }
  }
  if (typeof answers === "object" && answers !== null && !Array.isArray(answers)) {
    for (const question of QUESTIONS) {
      const value = (answers as Record<string, unknown>)[question.key];
      if (typeof value === "boolean") clean.answers[question.key] = value;
      else if (typeof value === "string" && value.length <= 600) clean.answers[question.key] = value;
      else if (Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string" && item.length <= 60)) clean.answers[question.key] = value as string[];
    }
  }
  clean.consentHealth = consentHealth === true;
  clean.consentTruth = consentTruth === true;
  return { step, draft: clean };
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** The text a person typed, ready to store: line breaks normalised and the ends trimmed. */
export function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").trim();
}

/** A number typed as people type it in Brazil ("72,5"); null for anything that is not one. */
export function parseNumber(text: string): number | null {
  const normalised = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** What is wrong with one answer, in words for the person — "" when it is fine or not given. */
function problemWith(question: Question, value: AnswerValue | undefined, context: AnamnesisContext): string {
  const given = value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0);
  if (!given) return "";
  switch (question.kind) {
    case "text": {
      const text = cleanText(String(value));
      if (CONTROL.test(text)) return `“${question.label}” tem caracteres que não podem ser enviados.`;
      if (text.length > question.maxLength) return `“${question.label}” passou de ${question.maxLength} caracteres.`;
      return "";
    }
    case "number": {
      const number = typeof value === "number" ? value : parseNumber(String(value));
      const [min, max] = question.range(context);
      if (number === null || (question.integer && !Number.isInteger(number)) || number < min || number > max) {
        return `${question.label}: informe um valor entre ${min} e ${max}${question.unit ? ` ${question.unit}` : ""}.`;
      }
      return "";
    }
    default:
      return "";
  }
}

function isAnswered(question: Question, value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (question.kind === "yesno") return typeof value === "boolean";
  if (question.kind === "multi") return Array.isArray(value) && value.length > 0;
  if (question.kind === "single") return typeof value === "string" && question.options.includes(value);
  return typeof value === "string" ? value.trim() !== "" : true;
}

export interface SectionProblems {
  /** Required questions still unanswered, as their labels. */
  missing: string[];
  /** Answers that are given but wrong (too long, out of range). */
  invalid: string[];
}

export function sectionProblems(section: SectionId, draft: AnamnesisDraft, context: AnamnesisContext): SectionProblems {
  if (section === "prontidao") {
    return { missing: PAR_Q.filter((q) => draft.parQ[q.key] === undefined).map((q) => q.text), invalid: [] };
  }
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const question of visibleQuestions(draft.answers, context, section)) {
    const value = draft.answers[question.key];
    const problem = problemWith(question, value, context);
    if (problem !== "") invalid.push(problem);
    else if (question.required && !isAnswered(question, value)) missing.push(question.label);
  }
  return { missing, invalid };
}

/** How many answers still stop "Continuar" in a section — the "Faltam N respostas" of the screen. */
export function sectionRemaining(section: SectionId, draft: AnamnesisDraft, context: AnamnesisContext): number {
  const { missing, invalid } = sectionProblems(section, draft, context);
  return missing.length + invalid.length;
}

export function consentGiven(draft: AnamnesisDraft): boolean {
  return draft.consentHealth && draft.consentTruth;
}

/** Whether the whole anamnese can be sent: every section complete and both consent boxes ticked. */
export function canSend(draft: AnamnesisDraft, context: AnamnesisContext): boolean {
  return SECTIONS.every((s) => sectionRemaining(s.id, draft, context) === 0) && consentGiven(draft);
}

// ---------- the stored record ----------

/** What is stored in `assessments/{id}.anamnesis`: a version and the answers, nothing derived. */
export interface AnamnesisRecord {
  version: number;
  answers: Record<string, string | string[] | boolean | number>;
}

function normalisedAnswer(question: Question, value: AnswerValue | undefined, context: AnamnesisContext): string | string[] | boolean | number | undefined {
  if (value === undefined) return undefined;
  switch (question.kind) {
    case "yesno":
      return typeof value === "boolean" ? value : undefined;
    case "single":
      return typeof value === "string" && question.options.includes(value) ? value : undefined;
    case "multi": {
      if (!Array.isArray(value)) return undefined;
      const picked = question.options.filter((option) => value.includes(option));
      if (question.none !== undefined && picked.includes(question.none)) return picked.length > 1 ? picked.filter((o) => o !== question.none) : [question.none];
      return picked.length === 0 ? undefined : picked;
    }
    case "text": {
      const text = cleanText(String(value));
      return text === "" ? undefined : text;
    }
    case "number": {
      const number = typeof value === "number" ? value : parseNumber(String(value));
      if (number === null) return undefined;
      const [min, max] = question.range(context);
      return number >= min && number <= max && (!question.integer || Number.isInteger(number)) ? number : undefined;
    }
  }
}

/** The record to store: only the questions that apply to this person, each answer cleaned; a hidden follow-up is dropped. */
export function buildRecord(draft: AnamnesisDraft, context: AnamnesisContext): AnamnesisRecord {
  const answers: AnamnesisRecord["answers"] = {};
  for (const question of visibleQuestions(draft.answers, context)) {
    const value = normalisedAnswer(question, draft.answers[question.key], context);
    if (value !== undefined) answers[question.key] = value;
  }
  return { version: ANAMNESIS_VERSION, answers };
}

/**
 * A stored `anamnesis` read leniently: it comes from a document the Rules let through but never from a trusted
 * writer, and a future version may add keys. Known questions only, each value in its own shape; anything else is
 * dropped. null when it is not a record at all — the assessment then reads as a plain PAR-Q+.
 */
export function parseAnamnesis(value: unknown): AnamnesisRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { version, answers } = value as { version?: unknown; answers?: unknown };
  if (typeof version !== "number" || !Number.isFinite(version)) return null;
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) return null;
  const clean: AnamnesisRecord["answers"] = {};
  const anywhere: AnamnesisContext = { gender: "", year: 9999 };
  for (const [key, raw] of Object.entries(answers as Record<string, unknown>)) {
    const question = QUESTION_BY_KEY.get(key);
    if (!question) continue;
    let candidate: AnswerValue | undefined;
    if (question.kind === "multi") candidate = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : undefined;
    else if (question.kind === "yesno") candidate = typeof raw === "boolean" ? raw : undefined;
    else if (question.kind === "number") candidate = typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
    else candidate = typeof raw === "string" ? raw.slice(0, question.kind === "text" ? question.maxLength : 200) : undefined;
    const normalised = candidate === undefined ? undefined : normalisedAnswer(question, candidate, anywhere);
    if (normalised !== undefined) clean[key] = normalised;
  }
  return { version, answers: clean };
}

// ---------- reading an answer back ----------

/** An answer as words, for the report and the diff; "—" when there is none. */
export function describeAnswer(question: Question, value: AnswerValue | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (typeof value === "number") return question.kind === "number" && question.unit ? `${String(value).replace(".", ",")} ${question.unit}` : String(value).replace(".", ",");
  return value === "" ? "—" : value;
}

const answerOf = (record: AnamnesisRecord | null, key: string): AnswerValue | undefined => record?.answers[key];
const listOf = (record: AnamnesisRecord | null, key: string): string[] => {
  const value = answerOf(record, key);
  return Array.isArray(value) ? value : [];
};
const textOf = (record: AnamnesisRecord | null, key: string): string => {
  const value = answerOf(record, key);
  return typeof value === "string" ? value : "";
};

// ---------- what the personal must look at first ----------

export type FlagLevel = "alert" | "warn" | "info";

export interface AnamnesisFlag {
  id: string;
  level: FlagLevel;
  /** A few words — the colour never carries the meaning alone. */
  label: string;
  detail: string;
}

/**
 * The points of attention, most serious first: PAR-Q+ "sim" answers, conditions, medication, pain or injury (by
 * region), surgery, pregnancy, smoking, short sleep, high stress. A flag is a reason to look, not a diagnosis. Works
 * on a plain PAR-Q+ (no record) too.
 */
export function anamnesisFlags(parQ: Readonly<Record<string, boolean>>, record: AnamnesisRecord | null): AnamnesisFlag[] {
  const flags: AnamnesisFlag[] = [];
  for (const question of PAR_Q) {
    if (parQ[question.key] === true) flags.push({ id: `parq:${question.key}`, level: "alert", label: "PAR-Q+: resposta “sim”", detail: question.text });
  }
  const conditions = listOf(record, "conditions").filter((c) => c !== NO_CONDITION);
  if (conditions.length > 0) {
    const other = textOf(record, "conditions_other");
    flags.push({ id: "conditions", level: "warn", label: "Condições de saúde", detail: conditions.map((c) => (c === "Outra" && other !== "" ? `Outra: ${other}` : c)).join(", ") });
  }
  if (answerOf(record, "medication") === true) {
    flags.push({ id: "medication", level: "warn", label: "Usa medicamento", detail: textOf(record, "medication_which") || "Não informou qual." });
  }
  if (answerOf(record, "pain") === true) {
    const regions = listOf(record, "pain_regions");
    const worse = answerOf(record, "pain_worse") === true ? " · piora com movimento" : "";
    flags.push({ id: "pain", level: "alert", label: "Dor ou lesão hoje", detail: `${regions.length > 0 ? regions.join(", ") : "Região não informada"}${worse}` });
  }
  if (answerOf(record, "surgery") === true) {
    flags.push({ id: "surgery", level: "warn", label: "Cirurgia anterior", detail: textOf(record, "surgery_which") || "Não informou qual." });
  }
  if (answerOf(record, "pregnancy") === true) {
    flags.push({ id: "pregnancy", level: "alert", label: "Gestante ou parto nos últimos 12 meses", detail: "Adapte a prescrição." });
  }
  if (answerOf(record, "smoking") === "Sim") flags.push({ id: "smoking", level: "info", label: "Fumante", detail: "" });
  if (answerOf(record, "sleep_hours") === SLEEP_SHORT) flags.push({ id: "sleep", level: "info", label: "Dorme pouco", detail: "Menos de 5 h por noite." });
  if (answerOf(record, "stress") === "Alto") flags.push({ id: "stress", level: "info", label: "Estresse alto", detail: "" });
  return flags;
}

// ---------- what changed since last time ----------

export interface AnswerChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

interface Snapshot {
  parQ: Readonly<Record<string, boolean>>;
  record: AnamnesisRecord | null;
}

/**
 * The answers that differ between two assessments of the same aluno. With a plain PAR-Q+ on either side only the
 * PAR-Q+ is compared — listing every question as "new" would hide what really changed.
 */
export function anamnesisDiff(previous: Snapshot, current: Snapshot): AnswerChange[] {
  const changes: AnswerChange[] = [];
  const word = (value: boolean | undefined) => (value === undefined ? "—" : value ? "Sim" : "Não");
  for (const question of PAR_Q) {
    if (previous.parQ[question.key] !== current.parQ[question.key]) {
      changes.push({ key: question.key, label: `PAR-Q+: ${question.text}`, before: word(previous.parQ[question.key]), after: word(current.parQ[question.key]) });
    }
  }
  if (previous.record === null || current.record === null) return changes;
  for (const question of QUESTIONS) {
    const before = describeAnswer(question, previous.record.answers[question.key]);
    const after = describeAnswer(question, current.record.answers[question.key]);
    if (before !== after) changes.push({ key: question.key, label: question.label, before, after });
  }
  return changes;
}

// ---------- the aluno's profile, brought up to date ----------

/** The stored experience level (`LEVELS`, the phone's own spelling) that an answer about training time maps to. */
export function levelFromExperience(experience: string | undefined): (typeof LEVELS)[number] | undefined {
  if (experience === "Nunca treinei" || experience === "Menos de 6 meses") return "Iniciante";
  if (experience === "6 meses a 2 anos") return "Interm.";
  if (experience === "Mais de 2 anos") return "Avançado";
  return undefined;
}

/** The profile's "restrições médicas", in words: what the personal would write down. Empty when there is nothing. */
export function restrictionsText(flags: readonly AnamnesisFlag[]): string {
  return flags
    .filter((flag) => flag.level !== "info" && !flag.id.startsWith("parq:"))
    .map((flag) => (flag.detail === "" || flag.detail === "Adapte a prescrição." ? flag.label : `${flag.label}: ${flag.detail}`))
    .join("; ");
}

/**
 * The profile fields the anamnese can update — objetivo, nível, dias de treino and restrições — and only those it
 * answers. The personal applies them with one click, after seeing what changes; nothing is written on its own.
 */
export function profilePatchFrom(parQ: Readonly<Record<string, boolean>>, record: AnamnesisRecord): Partial<StudentProfile> {
  const patch: Partial<StudentProfile> = {};
  const goal = record.answers.goal;
  if (typeof goal === "string") patch.goal = goal;
  const level = levelFromExperience(typeof record.answers.experience === "string" ? record.answers.experience : undefined);
  if (level !== undefined) patch.experienceLevel = level;
  const days = record.answers.days;
  if (Array.isArray(days) && days.length > 0) patch.trainingDays = TRAINING_DAYS.filter((day) => days.includes(day));
  const restrictions = restrictionsText(anamnesisFlags(parQ, record));
  const parQYes = PAR_Q.filter((q) => parQ[q.key] === true).length;
  const parts = [restrictions, parQYes > 0 ? `PAR-Q+: ${parQYes} resposta(s) “sim”` : ""].filter((part) => part !== "");
  if (parts.length > 0) patch.medicalNotes = parts.join("; ");
  return patch;
}

export interface ProfileChange {
  field: keyof StudentProfile;
  label: string;
  before: string;
  after: string;
}

const PROFILE_LABELS: Partial<Record<keyof StudentProfile, string>> = {
  goal: "Objetivo",
  experienceLevel: "Nível",
  trainingDays: "Dias de treino",
  medicalNotes: "Restrições médicas",
};

/** What `patch` would change in `current`, field by field — the confirmation lists exactly this. */
export function profilePatchChanges(current: StudentProfile, patch: Partial<StudentProfile>): ProfileChange[] {
  const changes: ProfileChange[] = [];
  for (const field of Object.keys(PROFILE_LABELS) as (keyof StudentProfile)[]) {
    const next = patch[field];
    if (next === undefined) continue;
    const show = (value: string | string[]) => (Array.isArray(value) ? value.join(", ") : value) || "—";
    const before = show(current[field] as string | string[]);
    const after = show(next as string | string[]);
    if (before !== after) changes.push({ field, label: PROFILE_LABELS[field] ?? field, before, after });
  }
  return changes;
}

// ---------- the report ----------

export interface ReportRow {
  key: string;
  label: string;
  value: string;
}

export interface ReportBlock {
  id: SectionId | "palavras";
  title: string;
  rows: ReportRow[];
}

/**
 * The answers laid out for reading: one block per section with the answered questions, and the free-text answers
 * together in "Nas palavras do aluno". Whatever was answered is shown, even a follow-up whose parent question the
 * profile would hide today; blocks with nothing to show are left out.
 */
export function reportBlocks(record: AnamnesisRecord): ReportBlock[] {
  const answers = record.answers as Answers;
  const blocks: ReportBlock[] = [];
  for (const section of SECTIONS) {
    if (section.id === "prontidao") continue;
    const rows: ReportRow[] = [];
    for (const question of QUESTIONS) {
      if (question.section !== section.id || question.kind === "text") continue;
      const value = answers[question.key];
      if (value !== undefined) rows.push({ key: question.key, label: question.label, value: describeAnswer(question, value) });
    }
    if (rows.length > 0) blocks.push({ id: section.id, title: section.title, rows });
  }
  const words: ReportRow[] = [];
  for (const question of QUESTIONS) {
    if (question.kind !== "text") continue;
    const value = answers[question.key];
    if (typeof value === "string" && value !== "") words.push({ key: question.key, label: question.label, value });
  }
  if (words.length > 0) blocks.push({ id: "palavras", title: "Nas palavras do aluno", rows: words });
  return blocks;
}
