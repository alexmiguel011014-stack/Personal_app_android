import { collection, doc, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from "firebase/firestore";
import { isCalendarDate } from "../../domain/dates";
import type { BillingErrorCode } from "../../domain/billing/ledger";
import type { BillingStatus } from "../../domain/billing/standing";
import {
  PLATFORM_TERM_KEYS,
  type PlatformBillingTermsOverrides,
  type PlatformTrainerTermsSnapshot,
} from "../../domain/platformBilling";
import type { AssignWrite, BillingScope, LedgerEntry, Loaded, PaymentWrite, VoidWrite } from "./engine";
import { billingStatusOf, nonNegativeInteger, nullableTimestamp, record, text } from "./parse";
import { planFromDocument, type PlanFieldSpec, type PlanScope } from "./plans";


// GOALS.md §36c — the ADM billing a personal, expressed as a scope of the shared billing engine. Nothing about the
// documents, the Rules or the audit entries changes (§35's are the contract): this file is where they are described once.

export type PlatformSubscriptionMode = "trial" | "paid";

export const SUBSCRIPTIONS = "platformSubscriptions";
export const TEMPLATES = "platformPlanTemplates";
export const PAYMENTS = "platformPayments";
export const AUDIT = "adminAudit";

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

/** The fields of a platform plan, as the form shows them and as the document stores them. */
export const PLATFORM_FIELDS: readonly PlanFieldSpec[] = [
  { key: "monthlyBaseCents", label: "Mensalidade (R$)", errorLabel: "A mensalidade", kind: "cents" },
  { key: "includedStudentSeats", label: "Alunos incluídos", errorLabel: "Os alunos incluídos", kind: "int" },
  { key: "extraStudentMonthlyCents", label: "Adicional mensal por aluno excedente (R$)", errorLabel: "O adicional por aluno", kind: "cents" },
  { key: "maxActiveInviteCodes", label: "Máximo de códigos de convite ativos ao mesmo tempo", errorLabel: "O limite de convites ativos", kind: "int" },
  { key: "trialDurationDays", label: "Período de teste (dias)", errorLabel: "O período de teste", kind: "int" },
];

export const PLATFORM_RULES_MESSAGE =
  "As regras atuais do Firestore ainda não liberam esta ação. Publique regras ADM para platformSubscriptions, platformPayments e adminAudit, além da leitura de platformPlanTemplates e users do personal.";

// ---- reading documents --------------------------------------------------------------------------------------

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
  for (const key of PLATFORM_TERM_KEYS) {
    if (data[key] !== undefined) parsed[key] = nonNegativeInteger(data[key], `Ajuste ${key}`);
  }
  return parsed;
}

export function parseSubscription(trainerUid: string, raw: unknown): PlatformSubscription {
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

export function parsePayment(id: string, raw: unknown): PlatformPayment {
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

/** The platform's payment document → the canonical ledger entry the engine and the shared screens use. */
export function paymentToEntry(payment: PlatformPayment): LedgerEntry {
  return {
    id: payment.id,
    payerId: payment.trainerUid,
    recordedBy: payment.paidBy,
    paidAt: payment.paidAt,
    amountCents: payment.amountCents,
    reference: payment.paymentReference,
    method: null,
    newUntil: payment.newUntil,
    paidThroughDate: payment.paidThroughDate,
    previousUntil: payment.previousUntil,
    previousStatus: payment.previousStatus,
    previousMode: payment.previousMode,
    planName: payment.planName,
    templateId: payment.templateId,
    templateVersion: payment.templateVersion,
    snapshotVersion: payment.snapshotVersion,
    source: "manual",
    voidedAt: payment.voidedAt,
    voidedBy: payment.voidedBy,
  };
}

/** …and back: the document the Rules accept (exactly these fields, no more). */
export function entryToPayment(entry: LedgerEntry, lastAuditId: string | null): PlatformPayment {
  return {
    id: entry.id,
    trainerUid: entry.payerId,
    paidAt: entry.paidAt,
    paidBy: entry.recordedBy,
    amountCents: entry.amountCents,
    paymentReference: entry.reference,
    newUntil: entry.newUntil,
    paidThroughDate: entry.paidThroughDate,
    previousUntil: entry.previousUntil,
    previousStatus: entry.previousStatus,
    previousMode: entry.previousMode,
    planName: entry.planName,
    templateId: entry.templateId,
    templateVersion: entry.templateVersion,
    snapshotVersion: entry.snapshotVersion,
    voidedAt: entry.voidedAt,
    voidedBy: entry.voidedBy,
    lastAuditId,
  };
}

// ---- the plans scope ----------------------------------------------------------------------------------------

/** The ADM's plans: `platformPlanTemplates`, each write tied to its audit entry in the same transaction. */
export function platformPlanScope(adminUid: string): PlanScope {
  return {
    collection: TEMPLATES,
    fields: PLATFORM_FIELDS,
    rulesMessage: "As regras atuais do Firestore ainda não permitem ler ou gravar os modelos de planos. Publique a versão atual de firestore.rules, com acesso somente ADM para platformPlanTemplates.",
    query: (db) => collection(db, TEMPLATES),
    write(tx, { db, action, id, version, fields }) {
      if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
      const auditRef = doc(collection(db, AUDIT));
      tx.set(doc(db, TEMPLATES, id), { ...fields, version, lastAuditId: auditRef.id });
      tx.set(auditRef, {
        at: Date.now(),
        adminUid,
        action: action === "create" ? "platform.plan.create" : "platform.plan.update",
        targetUid: id,
        note: action === "create" ? "Plano criado" : "Plano atualizado",
        templateId: id,
        templateVersion: version,
      });
    },
  };
}

// ---- the billing scope --------------------------------------------------------------------------------------

export interface PlatformRaw {
  userRef: DocumentReference;
  subscriptionRef: DocumentReference;
  user: DocumentSnapshot;
  subscription: PlatformSubscription | null;
}

export function billingSummary(status: BillingStatus, until: number | null, lastAuditId: string) {
  return { platformBillingStatus: status, platformBillingUntil: until, lastAuditId };
}

export function previousBillingSummary(user: { get(key: string): unknown }) {
  return {
    billingFromStatus: user.get("platformBillingStatus") ?? null,
    billingFromUntil: user.get("platformBillingUntil") ?? null,
  };
}

const MESSAGES: Partial<Record<BillingErrorCode | "stale" | "no_subscription", string>> = {
  invalid_amount: "Informe um valor recebido válido.",
  no_standing: "Este personal ainda não tem as regras de cobrança aplicadas. Reatribua o plano antes de registrar o pagamento.",
  no_subscription: "Cadastre um plano para este personal antes de registrar o pagamento.",
  stale: "Este personal foi atualizado em outro lugar. Recarregue a página e confira antes de registrar o pagamento.",
  not_latest: "Só é possível estornar o último pagamento, enquanto o vencimento ainda for o que ele definiu.",
  already_voided: "Este pagamento já foi estornado.",
  payment_too_old: "Esse pagamento é antigo demais para registrar.",
};

/** What the ADM does to a personal's billing. One instance per operation: it owns the audit entry's id. */
export function platformBillingScope(db: Firestore, adminUid: string): BillingScope<PlatformRaw> & { auditId: string } {
  const auditRef = doc(collection(db, AUDIT));
  const readPlan = (id: string, data: unknown) => planFromDocument(PLATFORM_FIELDS, id, data);

  return {
    auditId: auditRef.id,
    timeZone: "America/Sao_Paulo",
    termKeys: PLATFORM_TERM_KEYS,
    actorId: adminUid,
    messages: (code) => MESSAGES[code] ?? "Não foi possível concluir a operação.",
    newPaymentId: (database) => doc(collection(database, PAYMENTS)).id,

    async load(tx, trainerUid, purpose): Promise<Loaded<PlatformRaw>> {
      const userRef = doc(db, "users", trainerUid);
      const subscriptionRef = doc(db, SUBSCRIPTIONS, trainerUid);
      const [user, stored] = await Promise.all([tx.get(userRef), tx.get(subscriptionRef)]);
      if (purpose === "void") {
        if (!user.exists() || !stored.exists()) throw new Error("O perfil ou os termos do personal não existem mais.");
      } else if (!user.exists() || user.get("role") !== "TRAINER") {
        throw new Error(purpose === "assign" ? "O UID selecionado não pertence a um personal válido." : "O perfil selecionado não é um personal válido.");
      }
      const subscription = stored.exists() ? parseSubscription(trainerUid, stored.data()) : null;
      const until = user.get("platformBillingUntil");
      return {
        standing: { status: billingStatusOf(user.get("platformBillingStatus")), until: typeof until === "number" ? until : null },
        subscription: subscription && {
          mode: subscription.mode,
          trialStartedAt: subscription.trialStartedAt,
          trialEndsAt: subscription.trialEndsAt,
          billingDay: null,
          terms: subscription.terms,
        },
        raw: { userRef, subscriptionRef, user, subscription },
      };
    },

    async loadTemplate(tx, templateId) {
      const snapshot = await tx.get(doc(db, TEMPLATES, templateId));
      if (!snapshot.exists()) throw new Error("Selecione um modelo de plano existente.");
      return readPlan(snapshot.id, snapshot.data());
    },

    async checkAssignable(tx, loaded) {
      const invoiceId = loaded.raw.subscription?.currentInvoiceId;
      if (!invoiceId) return;
      const invoice = await tx.get(doc(db, "platformInvoices", invoiceId));
      if (!invoice.exists() || invoice.get("status") !== "paid") {
        throw new Error("Há uma fatura pendente. Confirme o pagamento antes de alterar o plano do personal.");
      }
    },

    async templateName(tx, templateId) {
      const snapshot = await tx.get(doc(db, TEMPLATES, templateId));
      return snapshot.exists() ? readPlan(snapshot.id, snapshot.data()).name : null;
    },

    async loadEntry(tx, paymentId) {
      const snapshot = await tx.get(doc(db, PAYMENTS, paymentId));
      if (!snapshot.exists()) throw new Error("O pagamento não existe mais. Recarregue a página.");
      return paymentToEntry(parsePayment(snapshot.id, snapshot.data()));
    },

    writeAssignment(tx: Transaction, write: AssignWrite<PlatformRaw>) {
      const { raw } = write.loaded;
      const subscription: PlatformSubscription = {
        trainerUid: write.payerId,
        mode: write.plan.mode,
        terms: write.terms as unknown as PlatformTrainerTermsSnapshot,
        overrides: write.overrides as PlatformBillingTermsOverrides,
        chargeDuringTrial: false,
        effectiveAt: write.effectiveAt,
        trialStartedAt: write.plan.trialStartedAt,
        trialEndsAt: write.plan.trialEndsAt,
        currentInvoiceId: raw.subscription?.currentInvoiceId ?? null,
        updatedAt: write.now,
        lastAuditId: auditRef.id,
      };
      const next = write.plan.nextStanding;
      tx.set(raw.subscriptionRef, subscription);
      tx.set(raw.userRef, billingSummary(next.status, next.until, auditRef.id), { merge: true });
      tx.set(auditRef, {
        at: write.now,
        action: "subscription.assign",
        adminUid,
        targetUid: write.payerId,
        note: `Plano atribuído: ${write.template.name}`,
        subscriptionVersion: write.terms.snapshotVersion,
        templateId: write.terms.templateId,
        templateVersion: write.terms.templateVersion,
        mode: subscription.mode,
        overrideKeys: Object.keys(write.overrides),
        effectiveAt: subscription.effectiveAt,
        ...previousBillingSummary(raw.user),
        billingToStatus: next.status,
        billingToUntil: next.until,
      });
    },

    writePayment(tx: Transaction, write: PaymentWrite<PlatformRaw>) {
      const { raw } = write.loaded;
      tx.set(doc(db, PAYMENTS, write.entry.id), { ...entryToPayment(write.entry, auditRef.id) });
      // update(), not set(): a subscription written before §35 carries `terms.trialMaxStudentSeats`, which the parser drops;
      // rewriting the whole document would change `terms` and the Rules only allow `mode`, `updatedAt`, `lastAuditId` here.
      if (write.plan.modeFlips) tx.update(raw.subscriptionRef, { mode: "paid", updatedAt: write.now, lastAuditId: auditRef.id });
      tx.set(raw.userRef, billingSummary("current", write.plan.newUntil, auditRef.id), { merge: true });
      tx.set(auditRef, {
        at: write.now,
        adminUid,
        action: "payment.record",
        targetUid: write.payerId,
        note: "Pagamento da mensalidade registrado",
        paymentId: write.entry.id,
        amountCents: write.entry.amountCents,
        paymentReference: write.entry.reference,
        paidThroughDate: write.plan.paidThroughDate,
        ...previousBillingSummary(raw.user),
        billingToStatus: "current",
        billingToUntil: write.plan.newUntil,
      });
    },

    writeVoid(tx: Transaction, write: VoidWrite<PlatformRaw>) {
      const { raw } = write.loaded;
      const voided: LedgerEntry = { ...write.entry, voidedAt: write.now, voidedBy: adminUid };
      tx.set(doc(db, PAYMENTS, write.entry.id), { ...entryToPayment(voided, auditRef.id) });
      if (write.plan.restoreMode) tx.update(raw.subscriptionRef, { mode: write.plan.restoreMode, updatedAt: write.now, lastAuditId: auditRef.id });
      tx.set(raw.userRef, billingSummary(write.plan.restore.status, write.plan.restore.until, auditRef.id), { merge: true });
      tx.set(auditRef, {
        at: write.now,
        adminUid,
        action: "payment.void",
        targetUid: write.entry.payerId,
        note: write.reason,
        paymentId: write.entry.id,
        amountCents: write.entry.amountCents,
        ...previousBillingSummary(raw.user),
        billingToStatus: write.plan.restore.status,
        billingToUntil: write.plan.restore.until,
      });
    },
  };
}

