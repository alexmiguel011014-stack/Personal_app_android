import { runTransaction, type Firestore, type Transaction } from "firebase/firestore";
import {
  BillingError,
  planAssignment,
  planPayment,
  planVoid,
  type AssignmentPlan,
  type BillingErrorCode,
  type BillingMode,
  type PaymentPlan,
  type Standing,
  type VoidPlan,
} from "../../domain/billing/ledger";
import type { BillingStatus } from "../../domain/billing/standing";
import { snapshotTerms, type BillingTemplate, type BillingTerms, type TermsSnapshot } from "../../domain/billing/terms";
import { nonNegativeInteger } from "./parse";
import type { BillingPlanRecord } from "./plans";

/** A subscription's terms as the engine builds them: the shared ones typed, the scope's own by key. */
export type ScopedTerms = TermsSnapshot<BillingTerms> & Record<string, unknown>;

// GOALS.md §36c — the transactions of billing, written once. The ADM billing a personal and a personal billing an aluno
// run these same functions; what differs — which documents exist, where the standing lives, what is audited — is the
// scope. A scope reads and writes the documents; the pure planners in domain/billing decide what happens.

export type PaymentMethod = "pix" | "cash" | "card" | "transfer" | "other";

/** One payment, canonical: what both scopes' ledgers record (a scope maps it to and from its own document). */
export interface LedgerEntry {
  id: string;
  payerId: string;
  /** Who recorded it (the ADM's or the trainer's uid): kept as it was when an entry is voided. */
  recordedBy: string;
  paidAt: number;
  amountCents: number;
  /** The platform's reference or the aluno's note. */
  reference: string | null;
  /** Aluno scope only. */
  method: PaymentMethod | null;
  newUntil: number;
  paidThroughDate: string;
  previousUntil: number | null;
  previousStatus: BillingStatus;
  previousMode: BillingMode;
  planName: string;
  templateId: string;
  templateVersion: number;
  snapshotVersion: number;
  /** `legacy` entries were imported from the old per-charge model and are never voided. */
  source: "manual" | "legacy";
  voidedAt: number | null;
  voidedBy: string | null;
}

/** What the engine needs to know about a stored subscription. */
export interface SubscriptionFacts {
  mode: BillingMode;
  trialStartedAt: number | null;
  trialEndsAt: number | null;
  billingDay: number | null;
  terms: { snapshotVersion: number; templateId: string; templateVersion: number; planName?: string };
}

/** Everything one transaction learned about a payer; `raw` is the scope's own business. */
export interface Loaded<Raw = unknown> {
  standing: Standing;
  subscription: SubscriptionFacts | null;
  raw: Raw;
}

export type Purpose = "assign" | "pay" | "void";

export interface AssignWrite<Raw> {
  payerId: string;
  loaded: Loaded<Raw>;
  template: BillingPlanRecord;
  terms: ScopedTerms;
  overrides: Record<string, number | null>;
  plan: AssignmentPlan;
  effectiveAt: number;
  now: number;
}

export interface PaymentWrite<Raw> {
  payerId: string;
  loaded: Loaded<Raw>;
  plan: PaymentPlan;
  entry: LedgerEntry;
  now: number;
}

export interface VoidWrite<Raw> {
  loaded: Loaded<Raw>;
  entry: LedgerEntry;
  plan: VoidPlan;
  voidedBy: string;
  reason: string;
  now: number;
}

export interface BillingScope<Raw = unknown> {
  /** The time zone the payer's days are read in. */
  readonly timeZone: string;
  /** The fields of this scope's plans that the subscription snapshots. */
  readonly termKeys: readonly string[];
  /** Of those, the ones that may be empty (an aluno plan without a billing day); every other key must be a number. */
  readonly optionalTermKeys?: readonly string[];
  /** Who is acting (the ADM's uid, the trainer's uid): recorded as `voidedBy` and in audits. */
  readonly actorId: string;
  /** What to say, per refusal, in this scope's words. */
  messages(code: BillingErrorCode | "stale" | "no_subscription"): string;
  newPaymentId(db: Firestore): string;
  /** Reads the payer, refusing one that cannot be billed. */
  load(tx: Transaction, payerId: string, purpose: Purpose): Promise<Loaded<Raw>>;
  loadTemplate(tx: Transaction, templateId: string): Promise<BillingPlanRecord>;
  /** A scope may stop an assignment (the platform's dormant unpaid-invoice rule). */
  checkAssignable?(tx: Transaction, loaded: Loaded<Raw>): Promise<void>;
  /** The plan name for a snapshot written before names were copied: read it from the template. */
  templateName(tx: Transaction, templateId: string): Promise<string | null>;
  /** The ledger entry, by id. */
  loadEntry(tx: Transaction, paymentId: string): Promise<LedgerEntry>;
  writeAssignment(tx: Transaction, write: AssignWrite<Raw>): void;
  writePayment(tx: Transaction, write: PaymentWrite<Raw>): void;
  writeVoid(tx: Transaction, write: VoidWrite<Raw>): void;
}

function say<Raw>(scope: BillingScope<Raw>, error: unknown): never {
  if (error instanceof BillingError) throw new Error(scope.messages(error.code));
  throw error;
}

export interface AssignInput {
  templateId: string;
  /** The effective terms, key by key (a form's values, possibly different from the template's: those are the overrides). */
  terms: Record<string, number | null>;
  effectiveAt: number;
}

/** Assigns a copied template snapshot; existing payers never follow later template edits. */
export async function assign<Raw>(db: Firestore, scope: BillingScope<Raw>, payerId: string, input: AssignInput, now = Date.now()): Promise<AssignWrite<Raw>> {
  if (!Number.isSafeInteger(input.effectiveAt) || input.effectiveAt > now) throw new Error("A data de vigência deve ser hoje ou anterior.");
  return runTransaction(db, async (tx) => {
    const loaded = await scope.load(tx, payerId, "assign");
    const template = await scope.loadTemplate(tx, input.templateId);
    await scope.checkAssignable?.(tx, loaded);
    const overrides: Record<string, number | null> = {};
    for (const key of scope.termKeys) {
      const value = input.terms[key];
      if (!((scope.optionalTermKeys?.includes(key) ?? false) && (value === null || value === undefined))) nonNegativeInteger(value, key);
      if ((value ?? null) !== (template[key] ?? null)) overrides[key] = value ?? null;
    }
    const snapshotVersion = nonNegativeInteger((loaded.subscription?.terms.snapshotVersion ?? 0) + 1, "Versão dos termos");
    // The scope names its own term keys; the engine only ever reads the shared ones (trialDurationDays, billingDay).
    const terms = snapshotTerms(template as BillingTemplate<BillingTerms>, overrides as Partial<BillingTerms>, snapshotVersion, scope.termKeys as readonly (keyof BillingTerms)[]) as ScopedTerms;
    const plan = planAssignment({ previous: loaded.subscription, standing: loaded.standing, trialDurationDays: terms.trialDurationDays, effectiveAt: input.effectiveAt });
    const write: AssignWrite<Raw> = { payerId, loaded, template, terms, overrides, plan, effectiveAt: input.effectiveAt, now };
    scope.writeAssignment(tx, write);
    return write;
  });
}

export interface PaymentInput {
  amountCents: number;
  reference: string | null;
  method?: PaymentMethod | null;
  /** When it was paid; defaults to now (the aluno scope lets the trainer pick an earlier day). */
  paidAt?: number;
  /** What the screen showed; a mismatch means someone else changed the payer, and nothing is written. */
  expected: { status: BillingStatus | null; until: number | null };
}

/**
 * Records a payment: the ledger entry, the new standing, the trial turning paid. One transaction, so the entry and the
 * standing can never disagree, and the stale-screen guard makes a double click or a second tab write nothing.
 */
export async function recordPayment<Raw>(db: Firestore, scope: BillingScope<Raw>, payerId: string, input: PaymentInput, now = Date.now()): Promise<LedgerEntry> {
  const id = scope.newPaymentId(db);
  return runTransaction(db, async (tx) => {
    const loaded = await scope.load(tx, payerId, "pay");
    if (!loaded.subscription) throw new Error(scope.messages("no_subscription"));
    const { status, until } = loaded.standing;
    if (status === null) throw new Error(scope.messages("no_standing"));
    if (status !== input.expected.status || until !== input.expected.until) throw new Error(scope.messages("stale"));
    const planName = loaded.subscription.terms.planName ?? (await scope.templateName(tx, loaded.subscription.terms.templateId)) ?? loaded.subscription.terms.templateId;
    const paidAt = input.paidAt ?? now;
    let plan: PaymentPlan;
    try {
      plan = planPayment({ at: paidAt, now, billingDay: loaded.subscription.billingDay, timeZone: scope.timeZone, standing: loaded.standing, mode: loaded.subscription.mode, amountCents: input.amountCents });
    } catch (error) {
      return say(scope, error);
    }
    const entry: LedgerEntry = {
      id,
      payerId,
      recordedBy: scope.actorId,
      paidAt,
      amountCents: input.amountCents,
      reference: input.reference,
      method: input.method ?? null,
      newUntil: plan.newUntil,
      paidThroughDate: plan.paidThroughDate,
      previousUntil: plan.previousUntil,
      previousStatus: plan.previousStatus,
      previousMode: plan.previousMode,
      planName,
      templateId: loaded.subscription.terms.templateId,
      templateVersion: loaded.subscription.terms.templateVersion,
      snapshotVersion: loaded.subscription.terms.snapshotVersion,
      source: "manual",
      voidedAt: null,
      voidedBy: null,
    };
    scope.writePayment(tx, { payerId, loaded, plan, entry, now });
    return entry;
  });
}

/** Undoes the latest payment: only while the standing is still the one it set, and it restores what was before. */
export async function voidPayment<Raw>(db: Firestore, scope: BillingScope<Raw>, paymentId: string, reason: string, now = Date.now()): Promise<LedgerEntry> {
  return runTransaction(db, async (tx) => {
    const entry = await scope.loadEntry(tx, paymentId);
    if (entry.voidedAt !== null) throw new Error(scope.messages("already_voided"));
    const loaded = await scope.load(tx, entry.payerId, "void");
    if (!loaded.subscription) throw new Error(scope.messages("no_subscription"));
    let plan: VoidPlan;
    try {
      plan = planVoid({ payment: entry, standing: loaded.standing, mode: loaded.subscription.mode });
    } catch (error) {
      return say(scope, error);
    }
    scope.writeVoid(tx, { loaded, entry, plan, voidedBy: scope.actorId, reason, now });
    return { ...entry, voidedAt: now, voidedBy: scope.actorId };
  });
}

