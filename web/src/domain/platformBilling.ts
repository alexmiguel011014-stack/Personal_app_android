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
  /** Maximum linked students plus pending invite reservations while on trial. */
  trialMaxStudentSeats: number;
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
    trialMaxStudentSeats: overrides.trialMaxStudentSeats ?? template.trialMaxStudentSeats,
    trialDurationDays: overrides.trialDurationDays ?? template.trialDurationDays,
    snapshotVersion,
    templateId: template.id,
    templateVersion: template.version,
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
  terms: Pick<PlatformBillingTerms, "maxActiveInviteCodes" | "trialMaxStudentSeats">;
  /** Accounts already linked to this trainer. */
  linkedStudentSeats: number;
  /** Seats held by unclaimed invites that count toward the trial's student limit. */
  pendingInviteReservations: number;
  /** Active codes currently owned by this trainer, including codes made outside the site. */
  activeInviteCodes: number;
  isTrial: boolean;
}

export type PlatformInviteDecision =
  | { allowed: true }
  | { allowed: false; reason: "active_invite_code_limit" | "trial_student_seat_limit" };

/**
 * Decides whether the site may issue one more invite code. Paid trainers can add students above
 * included seats (the extra-student price applies); during trial, linked seats and pending seat
 * reservations share the trial cap. Active code count is a separate simultaneous-code limit.
 */
export function canCreatePlatformInvite(input: PlatformInviteCapacity): PlatformInviteDecision {
  if (input.activeInviteCodes >= input.terms.maxActiveInviteCodes) {
    return { allowed: false, reason: "active_invite_code_limit" };
  }

  if (
    input.isTrial &&
    input.linkedStudentSeats + input.pendingInviteReservations >= input.terms.trialMaxStudentSeats
  ) {
    return { allowed: false, reason: "trial_student_seat_limit" };
  }

  return { allowed: true };
}
