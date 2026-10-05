import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";
import { addDays, isCalendarDate, localDate } from "../domain/dates";
import {
  isDeadlineExpired,
  snapshotPlatformTrainerTerms,
  type PlatformBillingPlanTemplate,
  type PlatformBillingTerms,
  type PlatformBillingTermsOverrides,
  type PlatformTrainerTermsSnapshot,
} from "../domain/platformBilling";

export type PlatformSubscriptionMode = "trial" | "paid";
export type PlatformInvoiceStatus = "unpaid" | "paid";

export interface PlatformSubscription {
  trainerUid: string;
  mode: PlatformSubscriptionMode;
  terms: PlatformTrainerTermsSnapshot;
  overrides: PlatformBillingTermsOverrides;
  chargeDuringTrial: boolean;
  effectiveAt: number;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  currentInvoiceId: string | null;
  updatedAt: number;
  /** Missing only on subscriptions written before audit links were introduced. */
  lastAuditId?: string | null;
}

export interface PlatformInvoice {
  id: string;
  trainerUid: string;
  period: string;
  dueDate: string;
  linkedStudentSeats: number;
  /** Missing only on invoices emitted before the privacy-safe billing callable. */
  reservedInviteSeats: number;
  /** Linked seats plus active invite reservations at invoice time. */
  billableStudentSeats: number;
  includedStudentSeats: number;
  extraStudentSeats: number;
  monthlyBaseCents: number;
  extraStudentMonthlyCents: number;
  extraAmountCents: number;
  amountCents: number;
  status: PlatformInvoiceStatus;
  paidAt: number | null;
  paidBy: string | null;
  paymentReference: string | null;
  createdAt: number;
  createdBy: string;
  subscriptionVersion: number;
  templateId: string;
  templateVersion: number;
  /** Missing only on invoices written before audit links were introduced. */
  lastAuditId?: string | null;
}

export interface PlatformBillingUsage {
  linkedStudentSeats: number;
  reservedInviteSeats: number;
  billableStudentSeats: number;
  extraStudentSeats: number;
  extraAmountCents: number;
  amountCents: number;
  includedStudentSeats: number;
  monthlyBaseCents: number;
  extraStudentMonthlyCents: number;
  maxActiveInviteCodes: number;
}

export interface PlatformSubscriptionView {
  subscription: PlatformSubscription | null;
  currentInvoice: PlatformInvoice | null;
}

export interface AssignPlatformSubscriptionInput {
  templateId: string;
  terms: PlatformBillingTerms;
  mode: PlatformSubscriptionMode;
  chargeDuringTrial: boolean;
  effectiveAt: number;
  reason: string;
}

const SUBSCRIPTIONS = "platformSubscriptions";
const INVOICES = "platformInvoices";
const AUDIT = "adminAudit";
const DAY_MS = 86_400_000;
const TERM_KEYS = [
  "monthlyBaseCents",
  "includedStudentSeats",
  "extraStudentMonthlyCents",
  "maxActiveInviteCodes",
  "trialMaxStudentSeats",
  "trialDurationDays",
] as const satisfies readonly (keyof PlatformBillingTerms)[];

const RULES_ERROR = "As regras atuais do Firestore ainda não liberam esta ação. Publique regras ADM para platformSubscriptions, platformInvoices e platformAudit, além da leitura de platformPlanTemplates, platformBillingConfig/trialDefaults e users do personal.";

function withRulesMessage<T>(work: () => Promise<T>): Promise<T> {
  return work().catch((error: unknown) => {
    if (error instanceof FirebaseError && (error.code === "permission-denied" || error.code === "unauthenticated")) {
      throw new Error(RULES_ERROR);
    }
    throw error;
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} está inválido no Firestore.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} está inválido no Firestore.`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} precisa ser um inteiro não negativo.`);
  return value;
}

function nullableTimestamp(value: unknown, label: string): number | null {
  return value === null ? null : nonNegativeInteger(value, label);
}

function parsePlanTemplate(id: string, raw: unknown): PlatformBillingPlanTemplate {
  const data = record(raw, "Modelo de plano");
  const version = nonNegativeInteger(data.version, "Versão do modelo");
  if (version < 1) throw new Error("O modelo de plano tem uma versão inválida.");
  return {
    id,
    name: text(data.name, "Nome do modelo"),
    version,
    monthlyBaseCents: nonNegativeInteger(data.monthlyBaseCents, "Mensalidade base"),
    includedStudentSeats: nonNegativeInteger(data.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: nonNegativeInteger(data.extraStudentMonthlyCents, "Adicional por aluno"),
    maxActiveInviteCodes: nonNegativeInteger(data.maxActiveInviteCodes, "Limite de convites"),
    trialMaxStudentSeats: nonNegativeInteger(data.trialMaxStudentSeats, "Limite de alunos no teste"),
    trialDurationDays: nonNegativeInteger(data.trialDurationDays, "Duração do teste"),
  };
}

function parseTerms(raw: unknown): PlatformTrainerTermsSnapshot {
  const data = record(raw, "Termos da assinatura");
  const snapshotVersion = nonNegativeInteger(data.snapshotVersion, "Versão dos termos");
  const templateVersion = nonNegativeInteger(data.templateVersion, "Versão do modelo");
  if (snapshotVersion < 1 || templateVersion < 1) throw new Error("A versão da assinatura está inválida.");
  return {
    monthlyBaseCents: nonNegativeInteger(data.monthlyBaseCents, "Mensalidade base"),
    includedStudentSeats: nonNegativeInteger(data.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: nonNegativeInteger(data.extraStudentMonthlyCents, "Adicional por aluno"),
    maxActiveInviteCodes: nonNegativeInteger(data.maxActiveInviteCodes, "Limite de convites"),
    trialMaxStudentSeats: nonNegativeInteger(data.trialMaxStudentSeats, "Limite de alunos no teste"),
    trialDurationDays: nonNegativeInteger(data.trialDurationDays, "Duração do teste"),
    snapshotVersion,
    templateId: text(data.templateId, "Modelo da assinatura"),
    templateVersion,
  };
}

function parseOverrides(raw: unknown): PlatformBillingTermsOverrides {
  const data = record(raw, "Ajustes individuais");
  const parsed: PlatformBillingTermsOverrides = {};
  for (const key of TERM_KEYS) {
    if (data[key] !== undefined) parsed[key] = nonNegativeInteger(data[key], `Ajuste ${key}`);
  }
  return parsed;
}

function parseSubscription(trainerUid: string, raw: unknown): PlatformSubscription {
  const data = record(raw, "Assinatura do personal");
  if (data.trainerUid !== trainerUid || (data.mode !== "trial" && data.mode !== "paid") || typeof data.chargeDuringTrial !== "boolean") {
    throw new Error("A assinatura do personal está inválida no Firestore.");
  }
  const trialStartedAt = nullableTimestamp(data.trialStartedAt, "Início do teste");
  const trialEndsAt = nullableTimestamp(data.trialEndsAt, "Fim do teste");
  if (data.mode === "trial" && (trialStartedAt === null || trialEndsAt === null)) throw new Error("As datas do teste estão inválidas.");
  return {
    trainerUid,
    mode: data.mode,
    terms: parseTerms(data.terms),
    overrides: parseOverrides(data.overrides),
    chargeDuringTrial: data.chargeDuringTrial,
    effectiveAt: nonNegativeInteger(data.effectiveAt, "Data de vigência"),
    trialStartedAt,
    trialEndsAt,
    currentInvoiceId: data.currentInvoiceId === null ? null : text(data.currentInvoiceId, "Fatura atual"),
    updatedAt: nonNegativeInteger(data.updatedAt, "Atualização da assinatura"),
    lastAuditId: data.lastAuditId === undefined || data.lastAuditId === null ? null : text(data.lastAuditId, "ID da auditoria"),
  };
}

function parseInvoice(id: string, raw: unknown): PlatformInvoice {
  const data = record(raw, "Fatura da plataforma");
  if ((data.status !== "unpaid" && data.status !== "paid") || !isCalendarDate(String(data.dueDate)) || !/^\d{4}-\d{2}$/.test(String(data.period))) {
    throw new Error("A fatura da plataforma está inválida no Firestore.");
  }
  const status = data.status;
  const paidAt = nullableTimestamp(data.paidAt, "Data do pagamento");
  if ((status === "paid") !== (paidAt !== null)) throw new Error("O estado do pagamento da fatura está inválido.");
  const legacyLinkedSeats = nonNegativeInteger(data.linkedStudentSeats, "Alunos vinculados na fatura");
  const reservedInviteSeats = data.reservedInviteSeats === undefined
    ? 0
    : nonNegativeInteger(data.reservedInviteSeats, "Convites reservados na fatura");
  const billableStudentSeats = data.billableStudentSeats === undefined
    ? legacyLinkedSeats
    : nonNegativeInteger(data.billableStudentSeats, "Vagas faturáveis na fatura");
  if (billableStudentSeats !== legacyLinkedSeats + reservedInviteSeats) throw new Error("A contagem de vagas da fatura está inconsistente.");
  return {
    id,
    trainerUid: text(data.trainerUid, "Personal da fatura"),
    period: String(data.period),
    dueDate: String(data.dueDate),
    linkedStudentSeats: legacyLinkedSeats,
    reservedInviteSeats,
    billableStudentSeats,
    includedStudentSeats: nonNegativeInteger(data.includedStudentSeats, "Alunos incluídos na fatura"),
    extraStudentSeats: nonNegativeInteger(data.extraStudentSeats, "Alunos excedentes na fatura"),
    monthlyBaseCents: nonNegativeInteger(data.monthlyBaseCents, "Mensalidade base na fatura"),
    extraStudentMonthlyCents: nonNegativeInteger(data.extraStudentMonthlyCents, "Adicional na fatura"),
    extraAmountCents: nonNegativeInteger(data.extraAmountCents, "Valor dos adicionais"),
    amountCents: nonNegativeInteger(data.amountCents, "Total da fatura"),
    status,
    paidAt,
    paidBy: data.paidBy === null ? null : text(data.paidBy, "Responsável pelo pagamento"),
    paymentReference: data.paymentReference === null ? null : text(data.paymentReference, "Referência do pagamento"),
    createdAt: nonNegativeInteger(data.createdAt, "Criação da fatura"),
    createdBy: text(data.createdBy, "ADM que emitiu a fatura"),
    subscriptionVersion: nonNegativeInteger(data.subscriptionVersion, "Versão da assinatura faturada"),
    templateId: text(data.templateId, "Modelo faturado"),
    templateVersion: nonNegativeInteger(data.templateVersion, "Versão do modelo faturado"),
    lastAuditId: data.lastAuditId === undefined || data.lastAuditId === null ? null : text(data.lastAuditId, "ID da auditoria"),
  };
}

function parseBillingUsage(raw: unknown): PlatformBillingUsage {
  const data = record(raw, "Resumo de cobrança");
  const linkedStudentSeats = nonNegativeInteger(data.linkedStudentSeats, "Alunos vinculados");
  const reservedInviteSeats = nonNegativeInteger(data.reservedInviteSeats, "Convites reservados");
  const billableStudentSeats = nonNegativeInteger(data.billableStudentSeats, "Vagas faturáveis");
  if (billableStudentSeats !== linkedStudentSeats + reservedInviteSeats) throw new Error("O resumo de vagas da plataforma está inconsistente.");
  return {
    linkedStudentSeats,
    reservedInviteSeats,
    billableStudentSeats,
    extraStudentSeats: nonNegativeInteger(data.extraStudentSeats, "Alunos excedentes"),
    extraAmountCents: nonNegativeInteger(data.extraAmountCents, "Valor dos adicionais"),
    amountCents: nonNegativeInteger(data.amountCents, "Total estimado"),
    includedStudentSeats: nonNegativeInteger(data.includedStudentSeats, "Alunos incluídos"),
    monthlyBaseCents: nonNegativeInteger(data.monthlyBaseCents, "Mensalidade base"),
    extraStudentMonthlyCents: nonNegativeInteger(data.extraStudentMonthlyCents, "Adicional por aluno"),
    maxActiveInviteCodes: nonNegativeInteger(data.maxActiveInviteCodes, "Limite de convites"),
  };
}

function requireActorAndReason(adminUid: string, reason: string): string {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  const normalized = reason.trim();
  if (normalized.length === 0 || normalized.length > 200) throw new Error("Informe um motivo com até 200 caracteres.");
  return normalized;
}

function invoiceDocument(invoice: PlatformInvoice): Record<string, unknown> {
  return { ...invoice };
}

function dueDateDeadline(date: string): number {
  return new Date(`${date}T23:59:59.999-03:00`).getTime();
}

function billingSummary(status: "pending" | "trial" | "current" | "blocked", until: number | null, lastAuditId: string) {
  return { platformBillingStatus: status, platformBillingUntil: until, lastAuditId };
}

function previousBillingSummary(user: { get(key: string): unknown }) {
  return {
    billingFromStatus: user.get("platformBillingStatus") ?? null,
    billingFromUntil: user.get("platformBillingUntil") ?? null,
  };
}

export async function loadPlatformSubscription(db: Firestore, trainerUid: string): Promise<PlatformSubscriptionView> {
  return withRulesMessage(async () => {
    const reference = doc(db, SUBSCRIPTIONS, trainerUid);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) return { subscription: null, currentInvoice: null };
    const subscription = parseSubscription(trainerUid, snapshot.data());
    if (!subscription.currentInvoiceId) return { subscription, currentInvoice: null };
    const invoiceSnapshot = await getDoc(doc(db, INVOICES, subscription.currentInvoiceId));
    const currentInvoice = invoiceSnapshot.exists() ? parseInvoice(invoiceSnapshot.id, invoiceSnapshot.data()) : null;
    if (currentInvoice && currentInvoice.trainerUid !== trainerUid) throw new Error("A fatura atual não pertence a este personal.");
    return {
      subscription,
      currentInvoice,
    };
  });
}

/** Reads only aggregate counts and prices from the ADM-only callable; no invite/student fields reach the browser. */
export async function loadPlatformBillingUsage(functions: Functions, trainerUid: string): Promise<PlatformBillingUsage> {
  const call = httpsCallable<{ trainerUid: string }, unknown>(functions, "getPlatformBillingUsage");
  return parseBillingUsage((await call({ trainerUid })).data);
}

/** Trainer-facing read-only billing history; blocked accounts keep access to this recovery information. */
export async function loadTrainerPlatformInvoices(db: Firestore, trainerUid: string): Promise<PlatformInvoice[]> {
  return withRulesMessage(async () => (await getDocs(query(collection(db, INVOICES), where("trainerUid", "==", trainerUid))))
    .docs.map((snapshot) => parseInvoice(snapshot.id, snapshot.data()))
    .sort((a, b) => b.period.localeCompare(a.period)));
}

/** Applies the configured trial snapshot only to a newly provisioned trainer with no terms yet. */
export async function applyPlatformDefaultsToNewTrainer(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
): Promise<boolean> {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  const now = Date.now();
  const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
  const userRef = doc(db, "users", trainerUid);
  const defaultsRef = doc(db, "platformBillingConfig", "trialDefaults");
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const [userSnapshot, existingSubscription, defaultsSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(subscriptionRef),
      transaction.get(defaultsRef),
    ]);
    if (!userSnapshot.exists() || userSnapshot.get("role") !== "TRAINER") throw new Error("O perfil selecionado não é um personal válido.");
    if (existingSubscription.exists()) return true;
    if (!defaultsSnapshot.exists()) return false;
    const defaults = record(defaultsSnapshot.data(), "Padrões de teste");
    const templateId = defaults.defaultPlanTemplateId;
    const durationDays = nonNegativeInteger(defaults.trialDurationDays, "Duração padrão do teste");
    const trialMaxStudentSeats = nonNegativeInteger(defaults.trialMaxStudentSeats, "Limite padrão de alunos no teste");
    if (typeof templateId !== "string" || !templateId || durationDays < 1) return false;
    const templateRef = doc(db, "platformPlanTemplates", templateId);
    const templateSnapshot = await transaction.get(templateRef);
    if (!templateSnapshot.exists()) return false;
    const template = parsePlanTemplate(templateSnapshot.id, templateSnapshot.data());
    const overrides: PlatformBillingTermsOverrides = {
      trialMaxStudentSeats,
      trialDurationDays: durationDays,
    };
    const terms = snapshotPlatformTrainerTerms(template, overrides, 1);
    const trialEndsAt = now + durationDays * DAY_MS;
    if (!Number.isSafeInteger(trialEndsAt)) throw new Error("A duração do teste ultrapassa o limite permitido.");
    const subscription: PlatformSubscription = {
      trainerUid,
      mode: "trial",
      terms,
      overrides,
      chargeDuringTrial: false,
      effectiveAt: now,
      trialStartedAt: now,
      trialEndsAt,
      currentInvoiceId: null,
      updatedAt: now,
      lastAuditId: auditRef.id,
    };
    transaction.set(subscriptionRef, subscription);
    transaction.set(userRef, billingSummary("trial", trialEndsAt, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      adminUid,
      action: "subscription.assign",
      targetUid: trainerUid,
      note: "Aplicação do padrão de teste na criação do personal",
      subscriptionVersion: terms.snapshotVersion,
      templateId: terms.templateId,
      templateVersion: terms.templateVersion,
      mode: "trial",
      overrideKeys: Object.keys(overrides),
      effectiveAt: subscription.effectiveAt,
      ...previousBillingSummary(userSnapshot),
      billingToStatus: "trial",
      billingToUntil: trialEndsAt,
    });
    return true;
  }));
}

/** Assigns a copied template snapshot; existing trainers never follow later template edits. */
export async function assignPlatformSubscription(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  input: AssignPlatformSubscriptionInput,
): Promise<PlatformSubscription> {
  const reason = requireActorAndReason(adminUid, input.reason);
  const now = Date.now();
  if (!Number.isSafeInteger(input.effectiveAt) || input.effectiveAt > now) throw new Error("A data de vigência deve ser hoje ou anterior.");
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const templateRef = doc(db, "platformPlanTemplates", input.templateId);
    const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
    const userRef = doc(db, "users", trainerUid);
    const [templateSnapshot, currentSnapshot, userSnapshot] = await Promise.all([
      transaction.get(templateRef),
      transaction.get(subscriptionRef),
      transaction.get(userRef),
    ]);
    if (!userSnapshot.exists() || userSnapshot.get("role") !== "TRAINER") throw new Error("O UID selecionado não pertence a um personal válido.");
    if (!templateSnapshot.exists()) throw new Error("Selecione um modelo de plano existente.");
    const template = parsePlanTemplate(templateSnapshot.id, templateSnapshot.data());
    const previous = currentSnapshot.exists() ? parseSubscription(trainerUid, currentSnapshot.data()) : null;
    if (previous?.currentInvoiceId) {
      const invoiceSnapshot = await transaction.get(doc(db, INVOICES, previous.currentInvoiceId));
      if (!invoiceSnapshot.exists() || invoiceSnapshot.get("status") !== "paid") {
        throw new Error("Há uma fatura pendente. Confirme o pagamento antes de alterar o plano do personal.");
      }
    }
    const effectiveTerms = { ...input.terms };
    for (const key of TERM_KEYS) nonNegativeInteger(effectiveTerms[key], key);
    if (input.mode !== "trial" && input.mode !== "paid") throw new Error("Selecione teste grátis ou plano pago.");
    if (input.mode === "trial" && effectiveTerms.trialDurationDays < 1) throw new Error("A duração do teste precisa ser de ao menos um dia.");
    const overrides: PlatformBillingTermsOverrides = {};
    for (const key of TERM_KEYS) if (effectiveTerms[key] !== template[key]) overrides[key] = effectiveTerms[key];
    const snapshotVersion = nonNegativeInteger((previous?.terms.snapshotVersion ?? 0) + 1, "Versão dos termos");
    const terms = snapshotPlatformTrainerTerms(template, overrides, snapshotVersion);
    const trialEndsAt = input.mode === "trial" ? input.effectiveAt + terms.trialDurationDays * DAY_MS : null;
    if (trialEndsAt !== null && !Number.isSafeInteger(trialEndsAt)) throw new Error("A duração do teste ultrapassa o limite permitido.");
    const subscription: PlatformSubscription = {
      trainerUid,
      mode: input.mode,
      terms,
      overrides,
      chargeDuringTrial: input.mode === "trial" && input.chargeDuringTrial,
      effectiveAt: input.effectiveAt,
      trialStartedAt: input.mode === "trial" ? input.effectiveAt : null,
      trialEndsAt,
      currentInvoiceId: previous?.currentInvoiceId ?? null,
      updatedAt: now,
      lastAuditId: auditRef.id,
    };
    transaction.set(subscriptionRef, subscription);
    const billingToStatus = input.mode === "trial" ? "trial" : "current";
    transaction.set(userRef, billingSummary(billingToStatus, trialEndsAt, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      action: "subscription.assign",
      adminUid,
      targetUid: trainerUid,
      note: reason,
      subscriptionVersion: terms.snapshotVersion,
      templateId: terms.templateId,
      templateVersion: terms.templateVersion,
      mode: subscription.mode,
      overrideKeys: Object.keys(overrides),
      effectiveAt: subscription.effectiveAt,
      ...previousBillingSummary(userSnapshot),
      billingToStatus,
      billingToUntil: trialEndsAt,
    });
    return subscription;
  }));
}

/** Creates the monthly invoice through the ADM-only callable and its authoritative server transaction. */
export async function issuePlatformInvoice(
  functions: Functions,
  trainerUid: string,
  dueDate: string,
  reasonInput: string,
): Promise<PlatformInvoice> {
  const reason = reasonInput.trim();
  if (reason.length === 0 || reason.length > 200) throw new Error("Informe um motivo com até 200 caracteres.");
  const now = Date.now();
  const today = localDate(now);
  if (!isCalendarDate(dueDate) || dueDate < today) throw new Error("Informe um vencimento válido que não seja anterior a hoje.");
  const call = httpsCallable<{ trainerUid: string; dueDate: string; reason: string }, unknown>(functions, "issuePlatformInvoice");
  const raw = record((await call({ trainerUid, dueDate, reason })).data, "Fatura da plataforma");
  return parseInvoice(text(raw.id, "ID da fatura"), raw);
}

export async function recordPlatformInvoicePayment(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  invoiceId: string,
  paymentReference: string,
): Promise<PlatformInvoice> {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  const reference = paymentReference.trim();
  if (reference.length > 120) throw new Error("A referência do pagamento pode ter até 120 caracteres.");
  const now = Date.now();
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const invoiceRef = doc(db, INVOICES, invoiceId);
    const userRef = doc(db, "users", trainerUid);
    const [snapshot, userSnapshot, subscriptionSnapshot] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(userRef),
      transaction.get(doc(db, SUBSCRIPTIONS, trainerUid)),
    ]);
    if (!snapshot.exists()) throw new Error("A fatura não existe mais. Recarregue o painel.");
    if (!userSnapshot.exists() || !subscriptionSnapshot.exists()) throw new Error("O perfil ou os termos do personal não existem mais.");
    const invoice = parseInvoice(snapshot.id, snapshot.data());
    if (invoice.trainerUid !== trainerUid) throw new Error("Esta fatura pertence a outro personal.");
    if (invoice.status === "paid") throw new Error("Esta fatura já foi registrada como paga.");
    const paid: PlatformInvoice = { ...invoice, status: "paid", paidAt: now, paidBy: adminUid, paymentReference: reference || null, lastAuditId: auditRef.id };
    const subscription = parseSubscription(trainerUid, subscriptionSnapshot.data());
    const isTrial = subscription.mode === "trial";
    const accessIsTrial = isTrial && typeof subscription.trialEndsAt === "number" && !isDeadlineExpired(subscription.trialEndsAt, now);
    if (subscription.currentInvoiceId !== invoiceId) throw new Error("Esta não é a fatura atual do personal.");
    const billingToStatus = isTrial ? (accessIsTrial ? "trial" : "blocked") : "current";
    const billingToUntil = isTrial ? subscription.trialEndsAt : null;
    transaction.set(invoiceRef, invoiceDocument(paid));
    transaction.set(userRef, billingSummary(billingToStatus, billingToUntil, auditRef.id), { merge: true });
    transaction.set(auditRef, { at: now, adminUid, action: "invoice.payment", targetUid: trainerUid, note: "Pagamento da fatura registrado", invoiceId, amountCents: invoice.amountCents, paymentReference: reference || null, ...previousBillingSummary(userSnapshot), billingToStatus, billingToUntil });
    return paid;
  }));
}

export async function extendPlatformInvoiceDueDate(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  invoiceId: string,
  days: number,
  reasonInput: string,
): Promise<PlatformInvoice> {
  const reason = requireActorAndReason(adminUid, reasonInput);
  if (!Number.isSafeInteger(days) || days <= 0) throw new Error("Informe uma quantidade inteira de dias maior que zero.");
  const now = Date.now();
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const invoiceRef = doc(db, INVOICES, invoiceId);
    const userRef = doc(db, "users", trainerUid);
    const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
    const [snapshot, userSnapshot, subscriptionSnapshot] = await Promise.all([
      transaction.get(invoiceRef),
      transaction.get(userRef),
      transaction.get(subscriptionRef),
    ]);
    if (!snapshot.exists()) throw new Error("A fatura não existe mais. Recarregue o painel.");
    if (!userSnapshot.exists() || !subscriptionSnapshot.exists()) throw new Error("O perfil ou os termos do personal não existem mais.");
    const invoice = parseInvoice(snapshot.id, snapshot.data());
    if (invoice.trainerUid !== trainerUid) throw new Error("Esta fatura pertence a outro personal.");
    if (invoice.status === "paid") throw new Error("O vencimento de uma fatura paga não pode ser prorrogado.");
    let dueDate: string;
    try { dueDate = addDays(invoice.dueDate, days); }
    catch { throw new Error("A prorrogação ultrapassa o intervalo de datas permitido."); }
    if (!isCalendarDate(dueDate)) throw new Error("A prorrogação ultrapassa o intervalo de datas permitido.");
    const subscription = parseSubscription(trainerUid, subscriptionSnapshot.data());
    const invoiceDeadline = dueDateDeadline(dueDate);
    const trialDeadline = subscription.mode === "trial" && typeof subscription.trialEndsAt === "number"
      ? Math.min(subscription.trialEndsAt, invoiceDeadline)
      : null;
    const trialExpired = subscription.mode === "trial" &&
      (subscription.trialEndsAt === null || isDeadlineExpired(subscription.trialEndsAt, now));
    const extended = { ...invoice, dueDate, lastAuditId: auditRef.id };
    transaction.set(invoiceRef, invoiceDocument(extended));
    const alreadyBlocked = userSnapshot.get("platformBillingStatus") === "blocked" ||
      isDeadlineExpired(dueDateDeadline(invoice.dueDate), now) || trialExpired;
    const billingToStatus = alreadyBlocked ? "blocked" : subscription.mode === "trial" ? "trial" : "current";
    const billingToUntil = subscription.mode === "trial"
      ? trialDeadline
      : alreadyBlocked ? userSnapshot.get("platformBillingUntil") ?? dueDateDeadline(invoice.dueDate) : invoiceDeadline;
    transaction.set(userRef, billingSummary(billingToStatus, billingToUntil, auditRef.id), { merge: true });
    transaction.set(auditRef, { at: now, adminUid, action: "invoice.extend", targetUid: trainerUid, note: reason, invoiceId, days, fromDueDate: invoice.dueDate, toDueDate: dueDate, ...previousBillingSummary(userSnapshot), billingToStatus, billingToUntil });
    return extended;
  }));
}

export async function extendPlatformTrial(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  days: number,
  reasonInput: string,
): Promise<PlatformSubscription> {
  const reason = requireActorAndReason(adminUid, reasonInput);
  if (!Number.isSafeInteger(days) || days <= 0) throw new Error("Informe uma quantidade inteira de dias maior que zero.");
  const now = Date.now();
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
    const userRef = doc(db, "users", trainerUid);
    const [subscriptionSnapshot, userSnapshot] = await Promise.all([
      transaction.get(subscriptionRef),
      transaction.get(userRef),
    ]);
    if (!subscriptionSnapshot.exists() || !userSnapshot.exists()) throw new Error("Os termos do personal não existem mais.");
    const subscription = parseSubscription(trainerUid, subscriptionSnapshot.data());
    if (subscription.mode !== "trial" || subscription.trialEndsAt === null) throw new Error("Este personal não tem um teste grátis ativo para prorrogar.");
    const nextTrialEndsAt = subscription.trialEndsAt + days * DAY_MS;
    if (!Number.isSafeInteger(nextTrialEndsAt)) throw new Error("A prorrogação ultrapassa o intervalo de datas permitido.");
    const extended: PlatformSubscription = { ...subscription, trialEndsAt: nextTrialEndsAt, updatedAt: now, lastAuditId: auditRef.id };
    const wasBlocked = userSnapshot.get("platformBillingStatus") === "blocked" || isDeadlineExpired(subscription.trialEndsAt, now);
    const billingToStatus = wasBlocked ? "blocked" : "trial";
    const billingToUntil = wasBlocked ? userSnapshot.get("platformBillingUntil") ?? subscription.trialEndsAt : nextTrialEndsAt;
    transaction.set(subscriptionRef, extended);
    transaction.set(userRef, billingSummary(billingToStatus, billingToUntil, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      adminUid,
      action: "trial.extend",
      targetUid: trainerUid,
      note: reason,
      days,
      fromTrialEndsAt: subscription.trialEndsAt,
      toTrialEndsAt: nextTrialEndsAt,
      ...previousBillingSummary(userSnapshot),
      billingToStatus,
      billingToUntil,
    });
    return extended;
  }));
}
