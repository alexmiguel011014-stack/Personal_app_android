import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import type { PlatformBillingPlanTemplate } from "../domain/platformBilling";

export type EditablePlatformPlanTemplate = Omit<PlatformBillingPlanTemplate, "id" | "version">;

export interface PlatformTrialDefaults {
  trialMaxStudentSeats: number;
  trialDurationDays: number;
  /** Current model copied for newly provisioned trainers; null means the ADM assigns manually. */
  defaultPlanTemplateId: string | null;
  version: number;
}

export type EditablePlatformTrialDefaults = Omit<PlatformTrialDefaults, "version">;

const TEMPLATE_COLLECTION = "platformPlanTemplates";
const DEFAULTS_DOCUMENT = ["platformBillingConfig", "trialDefaults"] as const;
const AUDIT_COLLECTION = "adminAudit";
const RULES_ERROR = "As regras atuais do Firestore ainda não permitem ler ou gravar os modelos de planos e padrões de teste. Atualize e publique firestore.rules com acesso somente ADM para platformPlanTemplates e platformBillingConfig/trialDefaults.";

function withRulesMessage<T>(work: () => Promise<T>): Promise<T> {
  return work().catch((error: unknown) => {
    if (error instanceof FirebaseError && error.code === "permission-denied") throw new Error(RULES_ERROR);
    throw error;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} precisa ser um número inteiro igual ou maior que zero.`);
  }
  return value;
}

function positiveVersion(value: unknown, label: string): number {
  const version = nonNegativeInteger(value, label);
  if (version === 0) throw new Error(`${label} precisa ser maior que zero.`);
  return version;
}

function validPlanName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 80) {
    throw new Error("O nome do plano precisa ter entre 1 e 80 caracteres.");
  }
  return value.trim();
}

function validateTemplate(input: EditablePlatformPlanTemplate): EditablePlatformPlanTemplate {
  return {
    name: validPlanName(input.name),
    monthlyBaseCents: nonNegativeInteger(input.monthlyBaseCents, "A mensalidade base"),
    includedStudentSeats: nonNegativeInteger(input.includedStudentSeats, "Os alunos incluídos"),
    extraStudentMonthlyCents: nonNegativeInteger(input.extraStudentMonthlyCents, "O adicional por aluno"),
    maxActiveInviteCodes: nonNegativeInteger(input.maxActiveInviteCodes, "O limite de convites ativos"),
    trialMaxStudentSeats: nonNegativeInteger(input.trialMaxStudentSeats, "O limite de alunos no teste"),
    trialDurationDays: nonNegativeInteger(input.trialDurationDays, "A duração do teste"),
  };
}

function templateFromDocument(id: string, value: unknown): PlatformBillingPlanTemplate {
  if (!isRecord(value)) throw new Error(`O modelo de plano ${id} está inválido no Firestore.`);
  try {
    const editable = validateTemplate({
      name: value.name as string,
      monthlyBaseCents: value.monthlyBaseCents as number,
      includedStudentSeats: value.includedStudentSeats as number,
      extraStudentMonthlyCents: value.extraStudentMonthlyCents as number,
      maxActiveInviteCodes: value.maxActiveInviteCodes as number,
      trialMaxStudentSeats: value.trialMaxStudentSeats as number,
      trialDurationDays: value.trialDurationDays as number,
    });
    return { ...editable, id, version: positiveVersion(value.version, "A versão do plano") };
  } catch {
    throw new Error(`O modelo de plano ${id} está inválido no Firestore. Revise os campos antes de editá-lo.`);
  }
}

function trialDefaultsFromDocument(value: unknown): PlatformTrialDefaults {
  if (!isRecord(value)) throw new Error("Os padrões de teste estão inválidos no Firestore.");
  try {
    const defaultPlanTemplateId = value.defaultPlanTemplateId == null || value.defaultPlanTemplateId === ""
      ? null
      : value.defaultPlanTemplateId;
    if (defaultPlanTemplateId !== null && typeof defaultPlanTemplateId !== "string") {
      throw new Error("O plano padrão está inválido.");
    }
    return {
      trialMaxStudentSeats: nonNegativeInteger(value.trialMaxStudentSeats, "O limite de alunos no teste"),
      trialDurationDays: nonNegativeInteger(value.trialDurationDays, "A duração do teste"),
      defaultPlanTemplateId,
      version: positiveVersion(value.version, "A versão dos padrões de teste"),
    };
  } catch {
    throw new Error("Os padrões de teste estão inválidos no Firestore. Revise os campos antes de editá-los.");
  }
}

function templateFields(template: EditablePlatformPlanTemplate, version: number, lastAuditId: string): Record<string, unknown> {
  return { ...validateTemplate(template), version, lastAuditId };
}

function auditInput(adminUid: string, reason: string): string {
  const note = reason.trim();
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  if (!note || note.length > 200) throw new Error("Informe um motivo com até 200 caracteres.");
  return note;
}

export async function loadPlatformPlanTemplates(db: Firestore): Promise<PlatformBillingPlanTemplate[]> {
  return withRulesMessage(async () => (await getDocs(collection(db, TEMPLATE_COLLECTION))).docs
    .map((snapshot) => templateFromDocument(snapshot.id, snapshot.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
}

export async function loadPlatformTrialDefaults(db: Firestore): Promise<PlatformTrialDefaults | null> {
  return withRulesMessage(async () => {
    const snapshot = await getDoc(doc(db, ...DEFAULTS_DOCUMENT));
    return snapshot.exists() ? trialDefaultsFromDocument(snapshot.data()) : null;
  });
}

export async function createPlatformPlanTemplate(
  db: Firestore,
  adminUid: string,
  input: EditablePlatformPlanTemplate,
  reasonInput: string,
): Promise<PlatformBillingPlanTemplate> {
  const note = auditInput(adminUid, reasonInput);
  return withRulesMessage(async () => {
    const validated = validateTemplate(input);
    const reference = doc(collection(db, TEMPLATE_COLLECTION));
    const auditRef = doc(collection(db, AUDIT_COLLECTION));
    const created: PlatformBillingPlanTemplate = { ...validated, id: reference.id, version: 1 };
    await runTransaction(db, async (transaction) => {
      transaction.set(reference, templateFields(validated, created.version, auditRef.id));
      transaction.set(auditRef, { at: Date.now(), adminUid, action: "platform.plan.create", targetUid: reference.id, note, templateId: reference.id, templateVersion: created.version });
    });
    return created;
  });
}

/** Uses a transaction so concurrent ADM edits always advance the stored version. */
export async function updatePlatformPlanTemplate(
  db: Firestore,
  adminUid: string,
  id: string,
  input: EditablePlatformPlanTemplate,
  reasonInput: string,
): Promise<PlatformBillingPlanTemplate> {
  const note = auditInput(adminUid, reasonInput);
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const reference = doc(db, TEMPLATE_COLLECTION, id);
    const auditRef = doc(collection(db, AUDIT_COLLECTION));
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("Este modelo não existe mais. Recarregue a página e tente novamente.");
    const current = templateFromDocument(snapshot.id, snapshot.data());
    const validated = validateTemplate(input);
    const updated: PlatformBillingPlanTemplate = {
      ...validated,
      id,
      version: nonNegativeInteger(current.version + 1, "A versão do plano"),
    };
    transaction.set(reference, templateFields(validated, updated.version, auditRef.id));
    transaction.set(auditRef, { at: Date.now(), adminUid, action: "platform.plan.update", targetUid: id, note, templateId: id, templateVersion: updated.version });
    return updated;
  }));
}

export async function savePlatformTrialDefaults(
  db: Firestore,
  adminUid: string,
  input: EditablePlatformTrialDefaults,
  reasonInput: string,
): Promise<PlatformTrialDefaults> {
  const note = auditInput(adminUid, reasonInput);
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const reference = doc(db, ...DEFAULTS_DOCUMENT);
    const auditRef = doc(collection(db, AUDIT_COLLECTION));
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists() ? trialDefaultsFromDocument(snapshot.data()) : null;
    const templateId = input.defaultPlanTemplateId?.trim() || null;
    if (templateId) {
      const templateReference = doc(db, TEMPLATE_COLLECTION, templateId);
      const templateSnapshot = await transaction.get(templateReference);
      if (!templateSnapshot.exists()) throw new Error("O plano escolhido como padrão não existe mais. Recarregue a página e tente novamente.");
      templateFromDocument(templateSnapshot.id, templateSnapshot.data());
    }
    const saved: PlatformTrialDefaults = {
      trialMaxStudentSeats: nonNegativeInteger(input.trialMaxStudentSeats, "O limite de alunos no teste"),
      trialDurationDays: nonNegativeInteger(input.trialDurationDays, "A duração do teste"),
      defaultPlanTemplateId: templateId,
      version: nonNegativeInteger((current?.version ?? 0) + 1, "A versão dos padrões de teste"),
    };
    transaction.set(reference, { ...saved, lastAuditId: auditRef.id });
    transaction.set(auditRef, { at: Date.now(), adminUid, action: "platform.defaults.update", targetUid: "platformBillingConfig/trialDefaults", note, defaultsVersion: saved.version, defaultPlanTemplateId: saved.defaultPlanTemplateId });
    return saved;
  }));
}
