import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, where, type Firestore } from "firebase/firestore";
import type { BillingStatus } from "../domain/mensalidades";
import type { PlatformBillingTerms } from "../domain/platformBilling";
import { isDeadlineExpired } from "../domain/platformBilling";
import { assign, recordPayment, voidPayment } from "./billing/engine";
import { billingStatusOf, requireActorAndReason, withRulesMessage as withRules } from "./billing/parse";
import {
  AUDIT,
  PAYMENTS,
  PLATFORM_RULES_MESSAGE,
  SUBSCRIPTIONS,
  billingSummary,
  entryToPayment,
  parsePayment,
  parseSubscription,
  platformBillingScope,
  previousBillingSummary,
  type PlatformPayment,
  type PlatformSubscription,
} from "./billing/platformScope";
import { INVOICES, parseInvoice, type PlatformInvoice } from "./platformInvoices";

export type { PlatformPayment, PlatformSubscription, PlatformSubscriptionMode } from "./billing/platformScope";
// The dormant invoice flow lives in its own file; it is re-exported so existing imports keep working.
export * from "./platformInvoices";

const DAY_MS = 86_400_000;
const withRulesMessage = <T,>(work: () => Promise<T>) => withRules(work, PLATFORM_RULES_MESSAGE);

export interface PlatformSubscriptionView {
  subscription: PlatformSubscription | null;
  currentInvoice: PlatformInvoice | null;
}

export interface AssignPlatformSubscriptionInput {
  templateId: string;
  terms: PlatformBillingTerms;
  effectiveAt: number;
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
    return { subscription, currentInvoice };
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
  const scope = platformBillingScope(db, adminUid);
  const write = await withRulesMessage(() => assign(db, scope, trainerUid, { templateId: input.templateId, terms: { ...input.terms }, effectiveAt: input.effectiveAt }));
  return {
    trainerUid,
    mode: write.plan.mode,
    terms: write.terms as unknown as PlatformSubscription["terms"],
    overrides: write.overrides as PlatformSubscription["overrides"],
    chargeDuringTrial: false,
    effectiveAt: write.effectiveAt,
    trialStartedAt: write.plan.trialStartedAt,
    trialEndsAt: write.plan.trialEndsAt,
    currentInvoiceId: write.loaded.raw.subscription?.currentInvoiceId ?? null,
    updatedAt: write.now,
    lastAuditId: scope.auditId,
  };
}

export interface RecordPlatformPaymentInput {
  amountCents: number;
  reference: string;
  /** What the ADM screen showed for this trainer; a mismatch means someone else changed it, and nothing is written. */
  expected: { status: BillingStatus | null; until: number | null };
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
  const scope = platformBillingScope(db, adminUid);
  const entry = await withRulesMessage(() => recordPayment(db, scope, trainerUid, { amountCents: input.amountCents, reference: reference || null, expected: input.expected }));
  return entryToPayment(entry, scope.auditId);
}

/**
 * Undoes the most recent payment (§35 D5): only while the trainer expiry is still the one this payment set, so a
 * later payment, plan change or extension makes it refuse instead of guessing. Restores the previous status, expiry and mode.
 */
export async function voidPlatformPayment(db: Firestore, adminUid: string, paymentId: string, reasonInput: string): Promise<PlatformPayment> {
  const reason = requireActorAndReason(adminUid, reasonInput);
  const scope = platformBillingScope(db, adminUid);
  const entry = await withRulesMessage(() => voidPayment(db, scope, paymentId, reason));
  return entryToPayment(entry, scope.auditId);
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
