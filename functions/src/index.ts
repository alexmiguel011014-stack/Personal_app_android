import { initializeApp, getApps } from "firebase-admin/app";
import { FieldPath, getFirestore, type DocumentData, type QuerySnapshot, type Transaction } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { isDeadlineExpired } from "./billingTime.js";

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

if (getApps().length === 0) initializeApp();

const db = getFirestore();
const DAY_MS = 86_400_000;

interface TermsSnapshot {
  monthlyBaseCents: number;
  includedStudentSeats: number;
  extraStudentMonthlyCents: number;
  maxActiveInviteCodes: number;
  trialDurationDays: number;
  snapshotVersion: number;
  templateId: string;
  templateVersion: number;
}

interface SubscriptionSnapshot {
  trainerUid: string;
  mode: "trial" | "paid";
  terms: TermsSnapshot;
  chargeDuringTrial: boolean;
  trialEndsAt: number | null;
  currentInvoiceId: string | null;
}

interface SeatCounts {
  linkedStudentSeats: number;
  reservedInviteSeats: number;
  billableStudentSeats: number;
}

function fail(code: "invalid-argument" | "unauthenticated" | "permission-denied" | "not-found" | "already-exists" | "failed-precondition" | "internal", message: string): never {
  throw new HttpsError(code, message);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail("failed-precondition", "Os termos da assinatura estão inválidos.");
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string, allowZero = true): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    fail("failed-precondition", `${label} está inválido nos termos atribuídos.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    fail("failed-precondition", `${label} está inválido nos termos atribuídos.`);
  }
  return value;
}

function parseSubscription(trainerUid: string, raw: unknown): SubscriptionSnapshot {
  const data = record(raw);
  if (data.trainerUid !== trainerUid || (data.mode !== "trial" && data.mode !== "paid") || typeof data.chargeDuringTrial !== "boolean") {
    fail("failed-precondition", "A assinatura do personal está inválida.");
  }
  const rawTerms = record(data.terms);
  const terms: TermsSnapshot = {
    monthlyBaseCents: integer(rawTerms.monthlyBaseCents, "Mensalidade base"),
    includedStudentSeats: integer(rawTerms.includedStudentSeats, "Alunos incluídos"),
    extraStudentMonthlyCents: integer(rawTerms.extraStudentMonthlyCents, "Adicional por aluno"),
    maxActiveInviteCodes: integer(rawTerms.maxActiveInviteCodes, "Limite de convites"),
    trialDurationDays: integer(rawTerms.trialDurationDays, "Duração do teste"),
    snapshotVersion: integer(rawTerms.snapshotVersion, "Versão dos termos", false),
    templateId: text(rawTerms.templateId, "Modelo da assinatura"),
    templateVersion: integer(rawTerms.templateVersion, "Versão do modelo", false),
  };
  const trialEndsAtValue = data.trialEndsAt;
  if (trialEndsAtValue !== null && (typeof trialEndsAtValue !== "number" || !Number.isSafeInteger(trialEndsAtValue))) {
    fail("failed-precondition", "A data final do teste está inválida.");
  }
  if (data.mode === "trial" && trialEndsAtValue === null) {
    fail("failed-precondition", "A data final do teste está inválida.");
  }
  const currentInvoiceId = data.currentInvoiceId;
  if (currentInvoiceId !== null && typeof currentInvoiceId !== "string") fail("failed-precondition", "A fatura atual da assinatura está inválida.");
  return {
    trainerUid,
    mode: data.mode,
    terms,
    chargeDuringTrial: data.chargeDuringTrial,
    trialEndsAt: trialEndsAtValue as number | null,
    currentInvoiceId: currentInvoiceId as string | null,
  };
}

function saoPauloDate(now: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === kind)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function dueDateDeadline(date: string): number {
  return Date.parse(`${date}T23:59:59.999-03:00`);
}

function requestActor(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) fail("unauthenticated", "Entre com a conta ADM para continuar.");
  return uid;
}

function validateInput(request: CallableRequest<unknown>): { trainerUid: string; dueDate: string; reason: string } {
  const data = record(request.data);
  const trainerUid = data.trainerUid;
  const dueDate = data.dueDate;
  const reason = data.reason;
  if (typeof trainerUid !== "string" || trainerUid.length === 0 || trainerUid.length > 128) {
    fail("invalid-argument", "Selecione um personal válido.");
  }
  if (typeof dueDate !== "string" || !isCalendarDate(dueDate)) fail("invalid-argument", "Informe um vencimento válido.");
  if (typeof reason !== "string" || reason.trim().length === 0 || reason.trim().length > 200) {
    fail("invalid-argument", "Informe um motivo com até 200 caracteres.");
  }
  return { trainerUid, dueDate, reason: reason.trim() };
}

function adminAndTrainerRefs(adminUid: string, trainerUid: string) {
  return {
    adminRef: db.collection("users").doc(adminUid),
    trainerRef: db.collection("users").doc(trainerUid),
    subscriptionRef: db.collection("platformSubscriptions").doc(trainerUid),
    trainerSummaryQuery: db.collection("users")
      .where(FieldPath.documentId(), "==", trainerUid)
      .select("role", "accessStatus", "platformBillingStatus", "platformBillingUntil"),
  };
}

/** Query projections deliberately exclude every invite code and all student profile fields. */
function seatQueries(trainerUid: string) {
  return {
    linkedUsers: db.collection("users")
      .where("role", "==", "STUDENT")
      .where("trainerId", "==", trainerUid)
      .select("role", "trainerId"),
    invites: db.collection("invites")
      .where("trainerId", "==", trainerUid)
      .select("used", "cancelledAt", "revokedAt", "expiresAt"),
  };
}

/** Read a masked lock query so the function serializes with website invite writes without loading lastCode. */
function inviteStateLockQuery(trainerUid: string) {
  return db.collection("platformInviteState")
    .where(FieldPath.documentId(), "==", trainerUid)
    .select("revision");
}

function reservationCount(invites: QuerySnapshot<DocumentData>, now: number): number {
  let count = 0;
  for (const snapshot of invites.docs) {
    const invite = snapshot.data();
    if (invite.used !== false || invite.cancelledAt != null || invite.revokedAt != null) continue;
    const expiresAt: unknown = invite.expiresAt;
    if (expiresAt == null) {
      count += 1;
      continue;
    }
    if (typeof expiresAt !== "number" || !Number.isSafeInteger(expiresAt)) {
      // Do not silently omit a malformed unresolved reservation and undercharge the account.
      fail("failed-precondition", "Há um convite legado com vencimento inválido. Resolva-o antes de emitir a fatura.");
    }
    if (expiresAt > now) count += 1;
  }
  return count;
}

async function readAuthorizedUsage(
  transaction: Transaction,
  adminUid: string,
  trainerUid: string,
  now: number,
) {
  const { adminRef, subscriptionRef, trainerSummaryQuery } = adminAndTrainerRefs(adminUid, trainerUid);
  const admin = await transaction.get(adminRef);
  if (!admin.exists || admin.get("role") !== "ADM") fail("permission-denied", "Somente uma conta ADM pode consultar a cobrança da plataforma.");

  const queries = seatQueries(trainerUid);
  const [trainer, subscriptionSnapshot, inviteState, linkedUsers, invites] = await Promise.all([
    transaction.get(trainerSummaryQuery),
    transaction.get(subscriptionRef),
    transaction.get(inviteStateLockQuery(trainerUid)),
    transaction.get(queries.linkedUsers),
    transaction.get(queries.invites),
  ]);
  if (trainer.empty || trainer.docs[0]?.get("role") !== "TRAINER") fail("not-found", "O UID selecionado não pertence a um personal válido.");
  if (!subscriptionSnapshot.exists) fail("failed-precondition", "Atribua um plano ou teste a este personal antes de consultar a cobrança.");
  const subscription = parseSubscription(trainerUid, subscriptionSnapshot.data());
  const linkedStudentSeats = linkedUsers.size;
  const reservedInviteSeats = reservationCount(invites, now);
  const billableStudentSeats = linkedStudentSeats + reservedInviteSeats;
  if (!Number.isSafeInteger(billableStudentSeats)) fail("failed-precondition", "A contagem de vagas excede o limite seguro.");
  return {
    admin,
    trainer: trainer.docs[0],
    subscriptionSnapshot,
    subscription,
    inviteState,
    linkedStudentSeats,
    reservedInviteSeats,
    billableStudentSeats,
  };
}

function pricing(subscription: SubscriptionSnapshot, seats: SeatCounts) {
  const { terms } = subscription;
  const extraStudentSeats = Math.max(0, seats.billableStudentSeats - terms.includedStudentSeats);
  const extraAmountCents = extraStudentSeats * terms.extraStudentMonthlyCents;
  const amountCents = terms.monthlyBaseCents + extraAmountCents;
  if (!Number.isSafeInteger(extraAmountCents) || !Number.isSafeInteger(amountCents)) {
    fail("failed-precondition", "O total calculado excede o limite seguro de centavos.");
  }
  return { extraStudentSeats, extraAmountCents, amountCents };
}

/** Privacy-safe read for the ADM panel; returns counts and prices only. */
const enforceCallableAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

export const getPlatformBillingUsage = onCall({ enforceAppCheck: enforceCallableAppCheck }, async (request) => {
  const adminUid = requestActor(request);
  const data = record(request.data);
  const trainerUid = data.trainerUid;
  if (typeof trainerUid !== "string" || trainerUid.length === 0 || trainerUid.length > 128) {
    fail("invalid-argument", "Selecione um personal válido.");
  }
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const usage = await readAuthorizedUsage(transaction, adminUid, trainerUid, now);
    const seats = {
      linkedStudentSeats: usage.linkedStudentSeats,
      reservedInviteSeats: usage.reservedInviteSeats,
      billableStudentSeats: usage.billableStudentSeats,
    };
    return {
      ...seats,
      ...pricing(usage.subscription, seats),
      includedStudentSeats: usage.subscription.terms.includedStudentSeats,
      monthlyBaseCents: usage.subscription.terms.monthlyBaseCents,
      extraStudentMonthlyCents: usage.subscription.terms.extraStudentMonthlyCents,
      maxActiveInviteCodes: usage.subscription.terms.maxActiveInviteCodes,
    };
  });
});

/** Emits one invoice from serializable, masked server-side seat queries. */
export const issuePlatformInvoice = onCall({ enforceAppCheck: enforceCallableAppCheck }, async (request) => {
  const adminUid = requestActor(request);
  const { trainerUid, dueDate, reason } = validateInput(request);
  const now = Date.now();
  const today = saoPauloDate(now);
  if (dueDate < today) fail("invalid-argument", "Informe um vencimento que não seja anterior a hoje.");
  const period = today.slice(0, 7);
  const invoiceId = `${trainerUid}_${period}`;
  const { trainerRef, subscriptionRef } = adminAndTrainerRefs(adminUid, trainerUid);
  const invoiceRef = db.collection("platformInvoices").doc(invoiceId);
  const auditRef = db.collection("adminAudit").doc();

  return db.runTransaction(async (transaction) => {
    const usage = await readAuthorizedUsage(transaction, adminUid, trainerUid, now);
    const [existingInvoice, outstandingInvoice] = await Promise.all([
      transaction.get(invoiceRef),
      usage.subscription.currentInvoiceId
        ? transaction.get(db.collection("platformInvoices").doc(usage.subscription.currentInvoiceId))
        : Promise.resolve(null),
    ]);
    if (existingInvoice.exists) fail("already-exists", `Já existe uma fatura para ${period}. Consulte a fatura atual antes de emitir outra.`);
    if (usage.subscription.mode === "trial" && !usage.subscription.chargeDuringTrial) {
      fail("failed-precondition", "O teste grátis não gera cobrança. Ative explicitamente a cobrança durante o teste ou atribua um plano pago.");
    }
    if (outstandingInvoice?.exists) {
      const status = outstandingInvoice.get("status");
      if (status === "unpaid") fail("failed-precondition", "Registre o pagamento ou prorrogue a fatura atual antes de emitir outra.");
      if (status !== "paid") fail("failed-precondition", "A fatura atual está inválida. Peça ao suporte para revisar a cobrança.");
    }

    const seats: SeatCounts = {
      linkedStudentSeats: usage.linkedStudentSeats,
      reservedInviteSeats: usage.reservedInviteSeats,
      billableStudentSeats: usage.billableStudentSeats,
    };
    const { extraStudentSeats, extraAmountCents, amountCents } = pricing(usage.subscription, seats);
    const invoice = {
      id: invoiceId,
      trainerUid,
      period,
      dueDate,
      linkedStudentSeats: seats.linkedStudentSeats,
      reservedInviteSeats: seats.reservedInviteSeats,
      billableStudentSeats: seats.billableStudentSeats,
      includedStudentSeats: usage.subscription.terms.includedStudentSeats,
      extraStudentSeats,
      monthlyBaseCents: usage.subscription.terms.monthlyBaseCents,
      extraStudentMonthlyCents: usage.subscription.terms.extraStudentMonthlyCents,
      extraAmountCents,
      amountCents,
      status: "unpaid",
      paidAt: null,
      paidBy: null,
      paymentReference: null,
      createdAt: now,
      createdBy: adminUid,
      subscriptionVersion: usage.subscription.terms.snapshotVersion,
      templateId: usage.subscription.terms.templateId,
      templateVersion: usage.subscription.terms.templateVersion,
      lastAuditId: auditRef.id,
    };
    const billingStatus = usage.trainer.get("platformBillingStatus");
    const billingUntil = usage.trainer.get("platformBillingUntil");
    const trialEndsAt = usage.subscription.trialEndsAt;
    const expiredTrial = usage.subscription.mode === "trial" && (trialEndsAt == null || isDeadlineExpired(trialEndsAt, now));
    const activeTrial = usage.subscription.mode === "trial" && !expiredTrial;
    const invoiceDeadline = dueDateDeadline(dueDate);
    const effectiveTrialDeadline = usage.subscription.mode === "trial" && typeof trialEndsAt === "number"
      ? Math.min(trialEndsAt, invoiceDeadline)
      : null;
    const effectiveDeadline = usage.subscription.mode === "trial" ? effectiveTrialDeadline : invoiceDeadline;
    const deadlineExpired = effectiveDeadline !== null && isDeadlineExpired(effectiveDeadline, now);
    const remainsBlocked = billingStatus === "blocked" || expiredTrial || deadlineExpired;
    const blockedUntil = billingStatus === "blocked"
      ? billingUntil ?? effectiveDeadline
      : effectiveDeadline;

    transaction.create(invoiceRef, invoice);
    const billingToStatus = remainsBlocked ? "blocked" : activeTrial ? "trial" : "current";
    const billingToUntil = remainsBlocked ? blockedUntil : activeTrial ? effectiveTrialDeadline : invoiceDeadline;
    transaction.update(subscriptionRef, { currentInvoiceId: invoiceId, updatedAt: now, lastAuditId: auditRef.id });
    transaction.set(trainerRef, {
      platformBillingStatus: billingToStatus,
      platformBillingUntil: billingToUntil,
      lastAuditId: auditRef.id,
    }, { merge: true });
    transaction.create(auditRef, {
      at: now,
      adminUid,
      action: "invoice.issue",
      targetUid: trainerUid,
      note: reason,
      invoiceId,
      period,
      linkedStudentSeats: seats.linkedStudentSeats,
      amountCents,
      billingFromStatus: billingStatus ?? null,
      billingFromUntil: billingUntil ?? null,
      billingToStatus,
      billingToUntil,
    });
    return invoice;
  });
});
