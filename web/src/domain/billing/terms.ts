/**
 * GOALS.md §36b — what a plan says, for either scope. The base is the same for the ADM's plans for personais and a
 * personal's plans for alunos; a scope adds its own limits on top (the platform's seats and invite codes, say) and the
 * engine never reads them.
 */

/** Integer cents and whole days. `billingDay` (1–31) anchors renewals for alunos; null/absent renews a month after payment. */
export interface BillingTerms {
  monthlyBaseCents: number;
  /** Days of free, uncapped trial a new subscription gets; 0 means no trial. */
  trialDurationDays: number;
  billingDay?: number | null;
}

/** A plan as its owner edits it: versioned, so an edit never changes who already uses it. */
export type BillingTemplate<T extends BillingTerms = BillingTerms> = T & { id: string; name: string; version: number };

/** The terms copied onto one payer's subscription: values plus where they came from. */
export type TermsSnapshot<T extends BillingTerms = BillingTerms> = T & {
  /** Revision of this payer's terms, incremented whenever their terms change. */
  snapshotVersion: number;
  templateId: string;
  templateVersion: number;
  /** The plan's name when copied; absent on snapshots written before §35. */
  planName?: string;
};

/**
 * Resolves a template plus per-payer overrides into a snapshot of values: later edits to the template cannot change the
 * returned object. `keys` names the fields that belong to the scope's terms; an explicit `null` override counts.
 */
export function snapshotTerms<T extends BillingTerms>(
  template: BillingTemplate<T>,
  overrides: Partial<T>,
  snapshotVersion: number,
  keys: readonly (keyof T)[],
): TermsSnapshot<T> {
  const resolved = {} as T;
  for (const key of keys) {
    resolved[key] = (overrides[key] !== undefined ? overrides[key] : template[key]) as T[keyof T];
  }
  return { ...resolved, snapshotVersion, templateId: template.id, templateVersion: template.version, planName: template.name };
}
