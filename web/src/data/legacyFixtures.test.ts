import { describe, expect, it } from "vitest";
import { legacyChargeDocs, legacyOwners, legacyPlanDocs, platformLegacySubscription, NOW } from "../domain/__fixtures__/legacyBilling";
import { paymentId } from "../domain/payments";
import { toBillingPlan, toPayment } from "./converters";

// GOALS.md §36a: the legacy fixtures are only worth having if the current code accepts them and they match what the Rules
// allow — otherwise they are as clean as the ones that hid §35's production bug.
const PLAN_FIELDS = ["studentId", "trainerId", "amountCents", "currency", "dueDay", "active", "createdAt"];
const CHARGE_FIELDS = ["trainerId", "studentId", "amountCents", "currency", "dueDate", "paidAt", "method", "source", "externalId", "note", "createdAt"];

describe("legacy billing fixtures", () => {
  it("every plan document has exactly the fields firestore.rules allow and converts", () => {
    for (const [id, doc] of Object.entries(legacyPlanDocs)) {
      expect(Object.keys(doc).sort(), id).toEqual([...PLAN_FIELDS].sort());
      expect(toBillingPlan(id, doc), id).not.toBeNull();
    }
  });

  it("every charge document has exactly the fields firestore.rules allow, the right id and converts", () => {
    for (const [id, doc] of Object.entries(legacyChargeDocs)) {
      expect(Object.keys(doc).sort(), id).toEqual([...CHARGE_FIELDS].sort());
      expect(id).toBe(paymentId(String(doc.studentId), String(doc.dueDate).slice(0, 7)));
      expect(toPayment(id, doc), id).not.toBeNull();
    }
  });

  it("covers the awkward cases the migration must survive", () => {
    const plans = Object.values(legacyPlanDocs);
    expect(plans.some((plan) => plan.active === false)).toBe(true);
    expect(plans.some((plan) => plan.dueDay === 31)).toBe(true);
    expect(Object.keys(legacyChargeDocs).some((id) => id.startsWith("s-31_2026-09"))).toBe(true);
    expect(legacyChargeDocs["s-31_2026-09"].dueDate).toBe("2026-09-30"); // the 31st clamped to a 30-day month
    expect(legacyOwners.get("draft-claimed")?.id).toBe("acct-claimed"); // billing registered on a claimed draft
  });

  it("the platform legacy subscription keeps the keys the parser no longer models", () => {
    const doc = platformLegacySubscription("trainerX", NOW);
    expect((doc.terms as Record<string, unknown>).trialMaxStudentSeats).toBe(3);
    expect((doc.overrides as Record<string, unknown>).trialMaxStudentSeats).toBe(2);
    expect((doc.terms as Record<string, unknown>).planName).toBeUndefined();
  });
});
