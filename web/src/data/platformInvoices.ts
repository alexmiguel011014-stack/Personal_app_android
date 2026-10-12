import { collection, doc, getDocs, query, runTransaction, where, type Firestore } from "firebase/firestore";
import { httpsCallable, type Functions } from "firebase/functions";
import { addDays, isCalendarDate, localDate } from "../domain/dates";
import { isDeadlineExpired } from "../domain/platformBilling";
import { nonNegativeInteger, nullableTimestamp, record, requireActorAndReason, text, withRulesMessage as withRules } from "./billing/parse";
import { PLATFORM_RULES_MESSAGE, SUBSCRIPTIONS, AUDIT, billingSummary, parseSubscription, previousBillingSummary } from "./billing/platformScope";

// The platform's manual-invoice flow (GOALS.md §30). Dormant since §35: it needs Cloud Functions (Blaze), the ADM
// screens no longer offer it, and a trainer only reads their old invoices. Kept, with its Rules and callables, for a
// future Blaze decision; nothing else imports the writers below.

export const INVOICES = "platformInvoices";
const withRulesMessage = <T,>(work: () => Promise<T>) => withRules(work, PLATFORM_RULES_MESSAGE);

export type PlatformInvoiceStatus = "unpaid" | "paid";

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

export function parseInvoice(id: string, raw: unknown): PlatformInvoice {
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

function invoiceDocument(invoice: PlatformInvoice): Record<string, unknown> {
  return { ...invoice };
}

function dueDateDeadline(date: string): number {
  return new Date(`${date}T23:59:59.999-03:00`).getTime();
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

