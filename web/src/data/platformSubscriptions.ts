import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
  type Firestore,
} from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";
import { addDays, isCalendarDate, localDate } from "../domain/dates";
import { nextPaidThrough, type BillingStatus } from "../domain/mensalidades";
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
  effectiveAt: number;
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
  "trialDurationDays",
] as const satisfies readonly (keyof PlatformBillingTerms)[];

const RULES_ERROR = "As regras atuais do Firestore ainda não liberam esta ação. Publique regras ADM para platformSubscriptions, platformPayments e adminAudit, além da leitura de platformPlanTemplates e users do personal.";

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
    trialDurationDays: nonNegativeInteger(data.trialDurationDays, "Duração do teste"),
    snapshotVersion,
    templateId: text(data.templateId, "Modelo da assinatura"),
    templateVersion,
    ...(typeof data.planName === "string" && data.planName.length > 0 ? { planName: data.planName } : {}),
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

/** A trainer's access state as stored on `users/{uid}` — what the ADM screens show and what a payment is checked against. */
export async function loadTrainerBilling(db: Firestore, trainerUid: string): Promise<{ status: BillingStatus | null; until: number | null }> {
  return withRulesMessage(async () => {
    const snapshot = await getDoc(doc(db, "users", trainerUid));
    const until = snapshot.get("platformBillingUntil");
    return { status: billingStatusOf(snapshot.get("platformBillingStatus")), until: typeof until === "number" ? until : null };
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

/**
 * Assigns a copied template snapshot; existing trainers never follow later template edits.
 * §35 D2: the first assignment decides how the account starts — a plan with trial days opens a free trial,
 * a plan without them leaves the account `pending` until the first payment. A later assignment only swaps
 * the terms: status and expiry are untouched, and an account never gets a second trial.
 */
export async function assignPlatformSubscription(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  input: AssignPlatformSubscriptionInput,
): Promise<PlatformSubscription> {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
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
    const overrides: PlatformBillingTermsOverrides = {};
    for (const key of TERM_KEYS) if (effectiveTerms[key] !== template[key]) overrides[key] = effectiveTerms[key];
    const snapshotVersion = nonNegativeInteger((previous?.terms.snapshotVersion ?? 0) + 1, "Versão dos termos");
    const terms = snapshotPlatformTrainerTerms(template, overrides, snapshotVersion);

    const fromStatus = billingStatusOf(userSnapshot.get("platformBillingStatus"));
    const fromUntil = (userSnapshot.get("platformBillingUntil") ?? null) as number | null;
    const startsTrial = terms.trialDurationDays > 0 && (previous === null || (previous.trialStartedAt === null && fromStatus === "pending"));
    let mode: PlatformSubscriptionMode;
    let trialStartedAt: number | null;
    let trialEndsAt: number | null;
    let billingToStatus: BillingStatus;
    let billingToUntil: number | null;
    if (startsTrial) {
      mode = "trial";
      trialStartedAt = input.effectiveAt;
      trialEndsAt = input.effectiveAt + terms.trialDurationDays * DAY_MS;
      if (!Number.isSafeInteger(trialEndsAt)) throw new Error("A duração do teste ultrapassa o limite permitido.");
      billingToStatus = "trial";
      billingToUntil = trialEndsAt;
    } else if (previous === null) {
      mode = "paid";
      trialStartedAt = null;
      trialEndsAt = null;
      billingToStatus = "pending";
      billingToUntil = null;
    } else {
      mode = previous.mode;
      trialStartedAt = previous.trialStartedAt;
      trialEndsAt = previous.trialEndsAt;
      billingToStatus = fromStatus ?? "pending";
      billingToUntil = fromUntil;
    }
    const subscription: PlatformSubscription = {
      trainerUid,
      mode,
      terms,
      overrides,
      chargeDuringTrial: false,
      effectiveAt: input.effectiveAt,
      trialStartedAt,
      trialEndsAt,
      currentInvoiceId: previous?.currentInvoiceId ?? null,
      updatedAt: now,
      lastAuditId: auditRef.id,
    };
    transaction.set(subscriptionRef, subscription);
    transaction.set(userRef, billingSummary(billingToStatus, billingToUntil, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      action: "subscription.assign",
      adminUid,
      targetUid: trainerUid,
      note: `Plano atribuído: ${template.name}`,
      subscriptionVersion: terms.snapshotVersion,
      templateId: terms.templateId,
      templateVersion: terms.templateVersion,
      mode: subscription.mode,
      overrideKeys: Object.keys(overrides),
      effectiveAt: subscription.effectiveAt,
      ...previousBillingSummary(userSnapshot),
      billingToStatus,
      billingToUntil,
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
    // update(), not set(): see recordPlatformPayment — a legacy snapshot's extra `terms` keys must stay untouched.
    transaction.update(subscriptionRef, { trialEndsAt: nextTrialEndsAt, updatedAt: now, lastAuditId: auditRef.id });
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

// ---- §35: the payment ledger -------------------------------------------------------------------------------

export interface PlatformPayment {
  id: string;
  trainerUid: string;
  paidAt: number;
  paidBy: string;
  amountCents: number;
  paymentReference: string | null;
  /** The expiry this payment set (23:59:59.999 São Paulo of `paidThroughDate`). */
  newUntil: number;
  paidThroughDate: string;
  previousUntil: number | null;
  previousStatus: BillingStatus;
  previousMode: PlatformSubscriptionMode;
  planName: string;
  templateId: string;
  templateVersion: number;
  snapshotVersion: number;
  voidedAt: number | null;
  voidedBy: string | null;
  lastAuditId: string | null;
}

export interface RecordPlatformPaymentInput {
  amountCents: number;
  reference: string;
  /** What the ADM screen showed for this trainer; a mismatch means someone else changed it, and nothing is written. */
  expected: { status: BillingStatus | null; until: number | null };
}

const PAYMENTS = "platformPayments";
const BILLING_STATUSES: readonly BillingStatus[] = ["pending", "trial", "current", "blocked"];

function billingStatusOf(value: unknown): BillingStatus | null {
  return BILLING_STATUSES.find((status) => status === value) ?? null;
}

function parsePayment(id: string, raw: unknown): PlatformPayment {
  const data = record(raw, "Pagamento da plataforma");
  const previousStatus = billingStatusOf(data.previousStatus);
  if (previousStatus === null || (data.previousMode !== "trial" && data.previousMode !== "paid") || !isCalendarDate(String(data.paidThroughDate))) {
    throw new Error("O pagamento da plataforma está inválido no Firestore.");
  }
  return {
    id,
    trainerUid: text(data.trainerUid, "Personal do pagamento"),
    paidAt: nonNegativeInteger(data.paidAt, "Data do pagamento"),
    paidBy: text(data.paidBy, "ADM do pagamento"),
    amountCents: nonNegativeInteger(data.amountCents, "Valor do pagamento"),
    paymentReference: data.paymentReference === null ? null : text(data.paymentReference, "Referência do pagamento"),
    newUntil: nonNegativeInteger(data.newUntil, "Novo vencimento"),
    paidThroughDate: String(data.paidThroughDate),
    previousUntil: nullableTimestamp(data.previousUntil, "Vencimento anterior"),
    previousStatus,
    previousMode: data.previousMode,
    planName: text(data.planName, "Plano do pagamento"),
    templateId: text(data.templateId, "Modelo do pagamento"),
    templateVersion: nonNegativeInteger(data.templateVersion, "Versão do modelo"),
    snapshotVersion: nonNegativeInteger(data.snapshotVersion, "Versão dos termos"),
    voidedAt: nullableTimestamp(data.voidedAt, "Data do estorno"),
    voidedBy: data.voidedBy === null ? null : text(data.voidedBy, "ADM do estorno"),
    lastAuditId: data.lastAuditId === undefined || data.lastAuditId === null ? null : text(data.lastAuditId, "ID da auditoria"),
  };
}

/** Every subscription, keyed by trainer UID. A malformed document is skipped so one bad record cannot blank the whole list. */
export async function loadAllPlatformSubscriptions(db: Firestore): Promise<Map<string, PlatformSubscription>> {
  return withRulesMessage(async () => {
    const result = new Map<string, PlatformSubscription>();
    for (const snapshot of (await getDocs(collection(db, SUBSCRIPTIONS))).docs) {
      try { result.set(snapshot.id, parseSubscription(snapshot.id, snapshot.data())); } catch { /* skipped on purpose */ }
    }
    return result;
  });
}

/** The ledger, newest first (single-field order, so no composite index). Capped; the list only needs recent payments. */
export async function loadPlatformPayments(db: Firestore, max = 500): Promise<PlatformPayment[]> {
  return withRulesMessage(async () => (await getDocs(query(collection(db, PAYMENTS), orderBy("paidAt", "desc"), limit(max)))).docs
    .flatMap((snapshot) => { try { return [parsePayment(snapshot.id, snapshot.data())]; } catch { return []; } }));
}

/** One trainer's own payments (the rules allow a trainer to read only these), newest first. */
export async function loadTrainerPlatformPayments(db: Firestore, trainerUid: string): Promise<PlatformPayment[]> {
  return withRulesMessage(async () => (await getDocs(query(collection(db, PAYMENTS), where("trainerUid", "==", trainerUid))))
    .docs.flatMap((snapshot) => { try { return [parsePayment(snapshot.id, snapshot.data())]; } catch { return []; } })
    .sort((a, b) => b.paidAt - a.paidAt));
}

/**
 * Marks the trainer paid: one transaction writes the ledger entry, moves the access to `current` through the
 * new expiry (§35 D1), flips a trial subscription to `paid`, and appends the audit entry the Rules link them by.
 */
export async function recordPlatformPayment(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  input: RecordPlatformPaymentInput,
): Promise<PlatformPayment> {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0) throw new Error("Informe um valor recebido válido.");
  const reference = input.reference.trim();
  if (reference.length > 120) throw new Error("A referência do pagamento pode ter até 120 caracteres.");
  const now = Date.now();
  const paymentRef = doc(collection(db, PAYMENTS));
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const userRef = doc(db, "users", trainerUid);
    const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
    const [userSnapshot, subscriptionSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(subscriptionRef)]);
    if (!userSnapshot.exists() || userSnapshot.get("role") !== "TRAINER") throw new Error("O perfil selecionado não é um personal válido.");
    if (!subscriptionSnapshot.exists()) throw new Error("Cadastre um plano para este personal antes de registrar o pagamento.");
    const subscription = parseSubscription(trainerUid, subscriptionSnapshot.data());
    const previousStatus = billingStatusOf(userSnapshot.get("platformBillingStatus"));
    const previousUntil = (userSnapshot.get("platformBillingUntil") ?? null) as number | null;
    if (previousStatus === null) throw new Error("Este personal ainda não tem as regras de cobrança aplicadas. Reatribua o plano antes de registrar o pagamento.");
    if (previousStatus !== input.expected.status || previousUntil !== input.expected.until) {
      throw new Error("Este personal foi atualizado em outro lugar. Recarregue a página e confira antes de registrar o pagamento.");
    }
    // Only a running trial or a current account carries an expiry worth extending; anything else restarts from today.
    const base = previousStatus === "trial" || previousStatus === "current" ? previousUntil : null;
    const next = nextPaidThrough(now, base);
    let planName = subscription.terms.planName ?? "";
    if (planName === "") {
      const templateSnapshot = await transaction.get(doc(db, "platformPlanTemplates", subscription.terms.templateId));
      planName = templateSnapshot.exists() ? parsePlanTemplate(templateSnapshot.id, templateSnapshot.data()).name : subscription.terms.templateId;
    }
    const payment: PlatformPayment = {
      id: paymentRef.id,
      trainerUid,
      paidAt: now,
      paidBy: adminUid,
      amountCents: input.amountCents,
      paymentReference: reference || null,
      newUntil: next.until,
      paidThroughDate: next.date,
      previousUntil,
      previousStatus,
      previousMode: subscription.mode,
      planName,
      templateId: subscription.terms.templateId,
      templateVersion: subscription.terms.templateVersion,
      snapshotVersion: subscription.terms.snapshotVersion,
      voidedAt: null,
      voidedBy: null,
      lastAuditId: auditRef.id,
    };
    transaction.set(paymentRef, { ...payment });
    if (subscription.mode === "trial") {
      // update(), not set(): a subscription written before §35 carries `terms.trialMaxStudentSeats`, which the parser drops;
      // rewriting the whole document would change `terms` and the Rules only allow `mode`, `updatedAt`, `lastAuditId` here.
      transaction.update(subscriptionRef, { mode: "paid", updatedAt: now, lastAuditId: auditRef.id });
    }
    transaction.set(userRef, billingSummary("current", next.until, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      adminUid,
      action: "payment.record",
      targetUid: trainerUid,
      note: "Pagamento da mensalidade registrado",
      paymentId: paymentRef.id,
      amountCents: input.amountCents,
      paymentReference: reference || null,
      paidThroughDate: next.date,
      ...previousBillingSummary(userSnapshot),
      billingToStatus: "current",
      billingToUntil: next.until,
    });
    return payment;
  }));
}

/**
 * Undoes the most recent payment (§35 D5): only while the trainer expiry is still the one this payment set, so a
 * later payment, plan change or extension makes it refuse instead of guessing. Restores the previous status, expiry and mode.
 */
export async function voidPlatformPayment(
  db: Firestore,
  adminUid: string,
  paymentId: string,
  reasonInput: string,
): Promise<PlatformPayment> {
  const reason = requireActorAndReason(adminUid, reasonInput);
  const now = Date.now();
  const auditRef = doc(collection(db, AUDIT));
  return withRulesMessage(() => runTransaction(db, async (transaction) => {
    const paymentRef = doc(db, PAYMENTS, paymentId);
    const paymentSnapshot = await transaction.get(paymentRef);
    if (!paymentSnapshot.exists()) throw new Error("O pagamento não existe mais. Recarregue a página.");
    const payment = parsePayment(paymentSnapshot.id, paymentSnapshot.data());
    if (payment.voidedAt !== null) throw new Error("Este pagamento já foi estornado.");
    const userRef = doc(db, "users", payment.trainerUid);
    const subscriptionRef = doc(db, SUBSCRIPTIONS, payment.trainerUid);
    const [userSnapshot, subscriptionSnapshot] = await Promise.all([transaction.get(userRef), transaction.get(subscriptionRef)]);
    if (!userSnapshot.exists() || !subscriptionSnapshot.exists()) throw new Error("O perfil ou os termos do personal não existem mais.");
    if (userSnapshot.get("platformBillingStatus") !== "current" || userSnapshot.get("platformBillingUntil") !== payment.newUntil) {
      throw new Error("Só é possível estornar o último pagamento, enquanto o vencimento ainda for o que ele definiu.");
    }
    const subscription = parseSubscription(payment.trainerUid, subscriptionSnapshot.data());
    const voided: PlatformPayment = { ...payment, voidedAt: now, voidedBy: adminUid, lastAuditId: auditRef.id };
    transaction.set(paymentRef, { ...voided });
    if (payment.previousMode === "trial" && subscription.mode === "paid") {
      transaction.update(subscriptionRef, { mode: "trial", updatedAt: now, lastAuditId: auditRef.id });
    }
    transaction.set(userRef, billingSummary(payment.previousStatus, payment.previousUntil, auditRef.id), { merge: true });
    transaction.set(auditRef, {
      at: now,
      adminUid,
      action: "payment.void",
      targetUid: payment.trainerUid,
      note: reason,
      paymentId,
      amountCents: payment.amountCents,
      ...previousBillingSummary(userSnapshot),
      billingToStatus: payment.previousStatus,
      billingToUntil: payment.previousUntil,
    });
    return voided;
  }));
}
