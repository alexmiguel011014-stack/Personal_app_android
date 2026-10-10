import type { Firestore } from "firebase/firestore";
import type { PlatformBillingPlanTemplate } from "../domain/platformBilling";
import { createPlan, loadPlans, updatePlan } from "./billing/plans";
import { platformPlanScope } from "./billing/platformScope";

// The ADM's plans (GOALS.md §30/§35) — the shared plan engine (billing/plans.ts) with the platform scope: the
// `platformPlanTemplates` collection and its audit entries. The old trial-defaults API is gone (§35).

export type EditablePlatformPlanTemplate = Omit<PlatformBillingPlanTemplate, "id" | "version">;

export async function loadPlatformPlanTemplates(db: Firestore): Promise<PlatformBillingPlanTemplate[]> {
  return (await loadPlans(db, platformPlanScope(""))) as unknown as PlatformBillingPlanTemplate[];
}

export async function createPlatformPlanTemplate(
  db: Firestore,
  adminUid: string,
  input: EditablePlatformPlanTemplate,
): Promise<PlatformBillingPlanTemplate> {
  return (await createPlan(db, platformPlanScope(adminUid), { ...input })) as unknown as PlatformBillingPlanTemplate;
}

/** Uses a transaction so concurrent ADM edits always advance the stored version. */
export async function updatePlatformPlanTemplate(
  db: Firestore,
  adminUid: string,
  id: string,
  input: EditablePlatformPlanTemplate,
): Promise<PlatformBillingPlanTemplate> {
  return (await updatePlan(db, platformPlanScope(adminUid), id, { ...input })) as unknown as PlatformBillingPlanTemplate;
}
