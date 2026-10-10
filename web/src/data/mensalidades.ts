import type { Firestore } from "firebase/firestore";
import { loadTrainers } from "./admin";
import type { TrainerUser } from "./converters";
import { loadPlatformPlanTemplates } from "./platformPlans";
import { loadAllPlatformSubscriptions, loadPlatformPayments, type PlatformPayment, type PlatformSubscription } from "./platformSubscriptions";
import { mensalidadeOf, type Mensalidade, type MensalidadeState } from "../domain/mensalidades";
import type { PlatformBillingPlanTemplate } from "../domain/platformBilling";

/** GOALS.md §35: everything the ADM screens need to say where each personal stands with the platform. */
export interface MensalidadeData {
  trainers: TrainerUser[];
  subscriptions: Map<string, PlatformSubscription>;
  templates: PlatformBillingPlanTemplate[];
  payments: PlatformPayment[];
  /** True when the payment ledger could not be read (e.g. rules not yet published); the rest still works. */
  paymentsUnavailable: boolean;
}

export interface MensalidadeRow {
  trainer: TrainerUser;
  subscription: PlatformSubscription | null;
  /** The plan's name, or null when the personal has no plan. */
  planName: string | null;
  mensalidade: Mensalidade;
  /** The most recent payment that was not voided. */
  lastPayment: PlatformPayment | null;
}

/** Trainers, subscriptions and templates are required; the payment ledger is optional (a failure only drops "último pagamento"). */
export async function loadMensalidadeData(db: Firestore, options: { payments: boolean } = { payments: true }): Promise<MensalidadeData> {
  const [trainers, subscriptions, templates, payments] = await Promise.all([
    loadTrainers(db),
    loadAllPlatformSubscriptions(db),
    loadPlatformPlanTemplates(db),
    options.payments ? loadPlatformPayments(db).then((value) => ({ value, failed: false }), () => ({ value: [] as PlatformPayment[], failed: true })) : Promise.resolve({ value: [] as PlatformPayment[], failed: false }),
  ]);
  return { trainers, subscriptions, templates, payments: payments.value, paymentsUnavailable: payments.failed };
}

/** One trainer's plan name and billing standing; the same derivation every ADM screen uses. */
export function describeMensalidade(
  trainer: TrainerUser,
  subscription: PlatformSubscription | null,
  templates: readonly PlatformBillingPlanTemplate[],
  now: number,
): { planName: string | null; mensalidade: Mensalidade } {
  return {
    planName: subscription ? subscription.terms.planName ?? templates.find((template) => template.id === subscription.terms.templateId)?.name ?? "Plano" : null,
    mensalidade: mensalidadeOf({
      hasSubscription: subscription !== null,
      billingStatus: trainer.platformBillingStatus ?? null,
      billingUntil: trainer.platformBillingUntil ?? null,
    }, now),
  };
}

export function buildMensalidadeRows(data: MensalidadeData, now: number): MensalidadeRow[] {
  const lastPayments = new Map<string, PlatformPayment>();
  for (const payment of data.payments) {
    if (payment.voidedAt === null && !lastPayments.has(payment.trainerUid)) lastPayments.set(payment.trainerUid, payment);
  }
  return data.trainers.map((trainer) => {
    const subscription = data.subscriptions.get(trainer.id) ?? null;
    return { trainer, subscription, ...describeMensalidade(trainer, subscription, data.templates, now), lastPayment: lastPayments.get(trainer.id) ?? null };
  });
}

export function mensalidadeCounts(rows: readonly MensalidadeRow[]): Record<MensalidadeState, number> {
  const counts: Record<MensalidadeState, number> = { sem_plano: 0, aguardando: 0, teste: 0, em_dia: 0, vence_breve: 0, atrasado: 0 };
  for (const row of rows) counts[row.mensalidade.state] += 1;
  return counts;
}
