import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import type { PlatformBillingPlanTemplate } from "../domain/platformBilling";

export type EditablePlatformPlanTemplate = Omit<PlatformBillingPlanTemplate, "id" | "version">;

const TEMPLATE_COLLECTION = "platformPlanTemplates";
const AUDIT_COLLECTION = "adminAudit";
const RULES_ERROR = "As regras atuais do Firestore ainda não permitem ler ou gravar os modelos de planos. Publique a versão atual de firestore.rules, com acesso somente ADM para platformPlanTemplates.";

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
    monthlyBaseCents: nonNegativeInteger(input.monthlyBaseCents, "A mensalidade"),
    includedStudentSeats: nonNegativeInteger(input.includedStudentSeats, "Os alunos incluídos"),
    extraStudentMonthlyCents: nonNegativeInteger(input.extraStudentMonthlyCents, "O adicional por aluno"),
    maxActiveInviteCodes: nonNegativeInteger(input.maxActiveInviteCodes, "O limite de convites ativos"),
    trialDurationDays: nonNegativeInteger(input.trialDurationDays, "O período de teste"),
  };
}

/** Old documents may still carry `trialMaxStudentSeats` (removed in §35); it is ignored here and dropped on the next save. */
function templateFromDocument(id: string, value: unknown): PlatformBillingPlanTemplate {
  if (!isRecord(value)) throw new Error(`O modelo de plano ${id} está inválido no Firestore.`);
  try {
    const editable = validateTemplate({
      name: value.name as string,
      monthlyBaseCents: value.monthlyBaseCents as number,
      includedStudentSeats: value.includedStudentSeats as number,
      extraStudentMonthlyCents: value.extraStudentMonthlyCents as number,
      maxActiveInviteCodes: value.maxActiveInviteCodes as number,
      trialDurationDays: value.trialDurationDays as number,
    });
    return { ...editable, id, version: positiveVersion(value.version, "A versão do plano") };
  } catch {
    throw new Error(`O modelo de plano ${id} está inválido no Firestore. Revise os campos antes de editá-lo.`);
  }
}

function templateFields(template: EditablePlatformPlanTemplate, version: number, lastAuditId: string): Record<string, unknown> {
  return { ...validateTemplate(template), version, lastAuditId };
}

function requireAdmin(adminUid: string): void {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
}

export async function loadPlatformPlanTemplates(db: Firestore): Promise<PlatformBillingPlanTemplate[]> {
  return withRulesMessage(async () => (await getDocs(collection(db, TEMPLATE_COLLECTION))).docs
    .map((snapshot) => templateFromDocument(snapshot.id, snapshot.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
}

export async function createPlatformPlanTemplate(
  db: Firestore,
  adminUid: string,
  input: EditablePlatformPlanTemplate,
): Promise<PlatformBillingPlanTemplate> {
  requireAdmin(adminUid);
  return withRulesMessage(async () => {
    const validated = validateTemplate(input);
    const reference = doc(collection(db, TEMPLATE_COLLECTION));
    const auditRef = doc(collection(db, AUDIT_COLLECTION));
    const created: PlatformBillingPlanTemplate = { ...validated, id: reference.id, version: 1 };
    await runTransaction(db, async (transaction) => {
      transaction.set(reference, templateFields(validated, created.version, auditRef.id));
      transaction.set(auditRef, { at: Date.now(), adminUid, action: "platform.plan.create", targetUid: reference.id, note: "Plano criado", templateId: reference.id, templateVersion: created.version });
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
): Promise<PlatformBillingPlanTemplate> {
  requireAdmin(adminUid);
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
    transaction.set(auditRef, { at: Date.now(), adminUid, action: "platform.plan.update", targetUid: id, note: "Plano atualizado", templateId: id, templateVersion: updated.version });
    return updated;
  }));
}
