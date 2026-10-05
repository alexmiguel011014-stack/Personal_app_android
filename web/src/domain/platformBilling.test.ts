import { describe, expect, it } from "vitest";
import { isDeadlineExpired as isCallableDeadlineExpired } from "../../../functions/src/billingTime";
import {
  canCreatePlatformInvite,
  effectivePlatformMonthlyAmountCents,
  isDeadlineExpired,
  snapshotPlatformTrainerTerms,
  type PlatformBillingPlanTemplate,
} from "./platformBilling";

const template: PlatformBillingPlanTemplate = {
  id: "template-a",
  name: "Standard",
  version: 4,
  monthlyBaseCents: 12000,
  includedStudentSeats: 5,
  extraStudentMonthlyCents: 700,
  maxActiveInviteCodes: 3,
  trialMaxStudentSeats: 2,
  trialDurationDays: 21,
};

describe("isDeadlineExpired", () => {
  it("treats the exact deadline as expired", () => {
    expect(isDeadlineExpired(10_000, 9_999)).toBe(false);
    expect(isDeadlineExpired(10_000, 10_000)).toBe(true);
    expect(isDeadlineExpired(10_000, 10_001)).toBe(true);
    expect(isDeadlineExpired(null, 10_000)).toBe(false);
    expect(isCallableDeadlineExpired(10_000, 9_999)).toBe(false);
    expect(isCallableDeadlineExpired(10_000, 10_000)).toBe(true);
    expect(isCallableDeadlineExpired(10_000, 10_001)).toBe(true);
  });
});

describe("snapshotPlatformTrainerTerms", () => {
  it("copies versioned template defaults and applies individual overrides", () => {
    expect(snapshotPlatformTrainerTerms(template, { monthlyBaseCents: 15000, maxActiveInviteCodes: 1 }, 2)).toEqual({
      monthlyBaseCents: 15000,
      includedStudentSeats: 5,
      extraStudentMonthlyCents: 700,
      maxActiveInviteCodes: 1,
      trialMaxStudentSeats: 2,
      trialDurationDays: 21,
      snapshotVersion: 2,
      templateId: "template-a",
      templateVersion: 4,
    });
  });

  it("keeps the resolved snapshot unchanged when the template is later edited", () => {
    const editableTemplate = { ...template };
    const snapshot = snapshotPlatformTrainerTerms(editableTemplate, {}, 1);
    editableTemplate.monthlyBaseCents = 20000;
    expect(snapshot.monthlyBaseCents).toBe(12000);
  });
});

describe("effectivePlatformMonthlyAmountCents", () => {
  it("charges the base through included seats and a recurring add-on for each linked extra student", () => {
    const terms = snapshotPlatformTrainerTerms(template, {}, 1);
    expect(effectivePlatformMonthlyAmountCents(terms, 0)).toBe(12000);
    expect(effectivePlatformMonthlyAmountCents(terms, 5)).toBe(12000);
    expect(effectivePlatformMonthlyAmountCents(terms, 7)).toBe(13400);
  });
});

describe("canCreatePlatformInvite", () => {
  const base = {
    terms: { maxActiveInviteCodes: 3, trialMaxStudentSeats: 2 },
    linkedStudentSeats: 0,
    pendingInviteReservations: 0,
    activeInviteCodes: 0,
    isTrial: false,
  } as const;

  it("allows paid trainers to create codes below the active-code limit, even above included seats", () => {
    expect(canCreatePlatformInvite({ ...base, linkedStudentSeats: 20 })).toEqual({ allowed: true });
  });

  it("blocks creation when already at the simultaneous active-code limit", () => {
    expect(canCreatePlatformInvite({ ...base, activeInviteCodes: 3 })).toEqual({
      allowed: false,
      reason: "active_invite_code_limit",
    });
  });

  it("uses linked students plus pending reservations against the trial cap", () => {
    expect(canCreatePlatformInvite({ ...base, isTrial: true, linkedStudentSeats: 1, pendingInviteReservations: 1 })).toEqual({
      allowed: false,
      reason: "trial_student_seat_limit",
    });
    expect(canCreatePlatformInvite({ ...base, isTrial: true, linkedStudentSeats: 1 })).toEqual({ allowed: true });
  });

  it("checks the active-code limit before trial seats when both are full", () => {
    expect(canCreatePlatformInvite({
      ...base,
      isTrial: true,
      linkedStudentSeats: 2,
      activeInviteCodes: 3,
    })).toEqual({ allowed: false, reason: "active_invite_code_limit" });
  });
});
