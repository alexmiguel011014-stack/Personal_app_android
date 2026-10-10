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
      trialDurationDays: 21,
      snapshotVersion: 2,
      templateId: "template-a",
      templateVersion: 4,
      planName: "Standard",
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
  const terms = { maxActiveInviteCodes: 3 };

  it("allows a code below the simultaneous active-code limit, whatever the student count", () => {
    expect(canCreatePlatformInvite({ terms, activeInviteCodes: 2 })).toEqual({ allowed: true });
  });

  it("blocks creation once the active-code limit is reached", () => {
    expect(canCreatePlatformInvite({ terms, activeInviteCodes: 3 })).toEqual({ allowed: false, reason: "active_invite_code_limit" });
    expect(canCreatePlatformInvite({ terms, activeInviteCodes: 9 })).toEqual({ allowed: false, reason: "active_invite_code_limit" });
  });

  it("has no trial student cap: a limit of zero codes is the only way to refuse", () => {
    expect(canCreatePlatformInvite({ terms: { maxActiveInviteCodes: 0 }, activeInviteCodes: 0 })).toEqual({
      allowed: false,
      reason: "active_invite_code_limit",
    });
  });
});
