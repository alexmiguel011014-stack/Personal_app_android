/**
 * Platform billing for trainer accounts. This is separate from billing.ts and its billingPlans /
 * payments, which represent what a trainer charges their students.
 */

/** All monetary values are integer cents in BRL. */
export interface PlatformBillingTerms {
  /** Recurring monthly amount before per-student add-ons. */
  monthlyBaseCents: number;
  /** Number of linked students included in the base monthly amount. */
  includedStudentSeats: number;
  /** Recurring monthly amount for each linked student above the included seats. */
  extraStudentMonthlyCents: number;
  /** Maximum unused, unrevoked, unexpired invite codes allowed at the same time on the site. */
  maxActiveInviteCodes: number;
  /** Days of free, uncapped trial a new account gets; 0 means no trial (§35: charging starts after it). */
  trialDurationDays: number;
}

/** ADM-managed default copied when assigning a platform plan to a trainer. */
export interface PlatformBillingPlanTemplate extends PlatformBillingTerms {
  id: string;
  name: string;
  /** Incremented when this template is edited; existing trainer snapshots do not change. */
  version: number;
}

export type PlatformBillingTermsOverrides = Partial<PlatformBillingTerms>;

/** Billing and trial deadlines expire at the deadline itself, matching Firestore Rules. */
export function isDeadlineExpired(deadline: unknown, now: number): boolean {
  return typeof deadline === "number" && deadline <= now;
}

/** Immutable-by-convention copy of a template and trainer-specific overrides at assignment time. */
export interface PlatformTrainerTermsSnapshot extends PlatformBillingTerms {
  /** Revision of the effective trainer terms, incremented when ADM changes that trainer's terms. */
  snapshotVersion: number;
  templateId: string;
  templateVersion: number;
  /** The plan's name when the terms were copied; absent on snapshots written before §35. */
  planName?: string;
}

/**
 * Resolves template defaults plus per-trainer overrides into a versioned value snapshot.
 * Later template edits cannot change this returned value.
 */
export function snapshotPlatformTrainerTerms(
  template: PlatformBillingPlanTemplate,
  overrides: PlatformBillingTermsOverrides,
  snapshotVersion: number,
): PlatformTrainerTermsSnapshot {
  return {
    monthlyBaseCents: overrides.monthlyBaseCents ?? template.monthlyBaseCents,
    includedStudentSeats: overrides.includedStudentSeats ?? template.includedStudentSeats,
    extraStudentMonthlyCents: overrides.extraStudentMonthlyCents ?? template.extraStudentMonthlyCents,
    maxActiveInviteCodes: overrides.maxActiveInviteCodes ?? template.maxActiveInviteCodes,
    trialDurationDays: overrides.trialDurationDays ?? template.trialDurationDays,
    snapshotVersion,
    templateId: template.id,
    templateVersion: template.version,
    planName: template.name,
  };
}

/** Expected recurring platform amount based on linked students; pending invites are not billed. */
export function effectivePlatformMonthlyAmountCents(
  terms: Pick<PlatformBillingTerms, "monthlyBaseCents" | "includedStudentSeats" | "extraStudentMonthlyCents">,
  linkedStudentSeats: number,
): number {
  const extraSeats = Math.max(0, linkedStudentSeats - terms.includedStudentSeats);
  return terms.monthlyBaseCents + extraSeats * terms.extraStudentMonthlyCents;
}

export interface PlatformInviteCapacity {
  terms: Pick<PlatformBillingTerms, "maxActiveInviteCodes">;
  /** Active codes currently owned by this trainer, including codes made outside the site. */
  activeInviteCodes: number;
}

export type PlatformInviteDecision =
  | { allowed: true }
  | { allowed: false; reason: "active_invite_code_limit" };

/**
 * Decides whether the site may issue one more invite code. The only limit is the simultaneous
 * active-code count (§35: a trial has no student cap); a student above the included seats is
 * allowed and carries the extra-student price.
 */
export function canCreatePlatformInvite(input: PlatformInviteCapacity): PlatformInviteDecision {
  if (input.activeInviteCodes >= input.terms.maxActiveInviteCodes) {
    return { allowed: false, reason: "active_invite_code_limit" };
  }
  return { allowed: true };
}
