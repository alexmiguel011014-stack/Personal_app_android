import { describe, expect, it } from "vitest";
import {
  BillingError,
  dueDateIn,
  endOfDayDeadline,
  nextPaidThrough,
  planAssignment,
  planPayment,
  planVoid,
  type PaymentInput,
} from "./ledger";

const at = (iso: string): number => Date.parse(iso);
const NOW = at("2026-10-09T15:00:00-03:00");
const day = (date: string): number => endOfDayDeadline(date);

describe("endOfDayDeadline", () => {
  it("keeps São Paulo's fixed -03:00 and resolves any other zone through Intl", () => {
    expect(endOfDayDeadline("2026-10-09")).toBe(at("2026-10-09T23:59:59.999-03:00"));
    expect(endOfDayDeadline("2026-10-09", "UTC")).toBe(at("2026-10-09T23:59:59.999Z"));
    expect(endOfDayDeadline("2026-10-09", "America/New_York")).toBe(at("2026-10-09T23:59:59.999-04:00")); // EDT
    expect(endOfDayDeadline("2026-12-09", "America/New_York")).toBe(at("2026-12-09T23:59:59.999-05:00")); // EST
    expect(endOfDayDeadline("2026-10-09", "Asia/Tokyo")).toBe(at("2026-10-09T23:59:59.999+09:00"));
  });

  it("ends the day one millisecond before the next one starts", () => {
    expect(endOfDayDeadline("2026-10-09") + 1).toBe(at("2026-10-10T00:00:00-03:00"));
  });
});

describe("dueDateIn", () => {
  it("clamps a day past the month's end", () => {
    expect(dueDateIn("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateIn("2028-02", 31)).toBe("2028-02-29");
    expect(dueDateIn("2026-04", 31)).toBe("2026-04-30");
    expect(dueDateIn("2026-10", 5)).toBe("2026-10-05");
  });
});

describe("nextPaidThrough", () => {
  it("without a billing day: a month after the current expiry while ahead, else after the payment day (§35)", () => {
    expect(nextPaidThrough(NOW, at("2026-10-16T14:00:00-03:00")).date).toBe("2026-11-16"); // paid during a trial
    expect(nextPaidThrough(NOW, day("2026-10-20")).date).toBe("2026-11-20");
    expect(nextPaidThrough(NOW, day("2026-10-01")).date).toBe("2026-11-09"); // lapsed: from today
    expect(nextPaidThrough(NOW, null).date).toBe("2026-11-09");
    expect(nextPaidThrough(at("2026-01-31T10:00:00-03:00"), null).date).toBe("2026-02-28");
    expect(nextPaidThrough(NOW, NOW).date).toBe("2026-11-09"); // exactly now is expired
  });

  it("with a billing day: that day of the month after the base date (§36 D3)", () => {
    const today = at("2026-10-15T12:00:00-03:00");
    expect(nextPaidThrough(today, null, 10).date).toBe("2026-11-10"); // paid late: next due day
    expect(nextPaidThrough(at("2026-11-05T12:00:00-03:00"), day("2026-11-10"), 10).date).toBe("2026-12-10"); // paid early: the one after
    expect(nextPaidThrough(NOW, at("2026-10-16T14:00:00-03:00"), 10).date).toBe("2026-11-10"); // during a trial: from its end
    expect(nextPaidThrough(at("2026-01-15T12:00:00-03:00"), null, 31).date).toBe("2026-02-28"); // dia 31 in February
    expect(nextPaidThrough(at("2026-12-20T12:00:00-03:00"), null, 5).date).toBe("2027-01-05"); // year roll
  });

  it("ends the expiry at the end of that day", () => {
    const result = nextPaidThrough(at("2026-10-15T12:00:00-03:00"), null, 10);
    expect(result.until).toBe(at("2026-11-10T23:59:59.999-03:00"));
  });

  it("counts a backdated payment from the day it was made", () => {
    expect(nextPaidThrough(at("2026-10-05T12:00:00-03:00"), null, 10).date).toBe("2026-11-10");
    expect(nextPaidThrough(at("2026-10-05T12:00:00-03:00"), null).date).toBe("2026-11-05");
  });

  it("reads the payment day in the zone it is given", () => {
    const lateNight = at("2026-10-10T01:30:00Z"); // 22:30 on the 9th in São Paulo, already the 10th in UTC
    expect(nextPaidThrough(lateNight, null).date).toBe("2026-11-09");
    expect(nextPaidThrough(lateNight, null, null, "UTC").date).toBe("2026-11-10");
    expect(nextPaidThrough(lateNight, null, null, "UTC").until).toBe(at("2026-11-10T23:59:59.999Z"));
  });
});

describe("planPayment", () => {
  const base: PaymentInput = {
    at: NOW, now: NOW, billingDay: null, standing: { status: "pending", until: null }, mode: "paid", amountCents: 10_000,
  };

  it("opens a pending account for a month and keeps the mode", () => {
    expect(planPayment(base)).toEqual({
      previousStatus: "pending", previousUntil: null, previousMode: "paid", newUntil: day("2026-11-09"), paidThroughDate: "2026-11-09", modeFlips: false,
    });
  });

  it("turns a trial into paid and counts from the trial's end", () => {
    const trialEnd = at("2026-10-16T14:00:00-03:00");
    const plan = planPayment({ ...base, standing: { status: "trial", until: trialEnd }, mode: "trial" });
    expect(plan).toMatchObject({ previousStatus: "trial", previousUntil: trialEnd, previousMode: "trial", paidThroughDate: "2026-11-16", modeFlips: true });
  });

  it("restarts from the payment day when the access lapsed or was blocked, whatever stale expiry is stored", () => {
    expect(planPayment({ ...base, standing: { status: "current", until: day("2026-10-01") } }).paidThroughDate).toBe("2026-11-09");
    expect(planPayment({ ...base, standing: { status: "blocked", until: day("2026-12-31") } }).paidThroughDate).toBe("2026-11-09");
  });

  it("anchors an aluno payment to the billing day and accepts a backdated one", () => {
    const plan = planPayment({ ...base, billingDay: 10, at: at("2026-10-05T12:00:00-03:00"), standing: { status: "current", until: day("2026-10-10") } });
    expect(plan.paidThroughDate).toBe("2026-11-10");
  });

  it("refuses an invalid amount, a missing standing and a payment so old the expiry stays in the past", () => {
    for (const amountCents of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      expect(() => planPayment({ ...base, amountCents })).toThrowError(expect.objectContaining({ code: "invalid_amount" }));
    }
    expect(() => planPayment({ ...base, standing: { status: null, until: null } })).toThrowError(expect.objectContaining({ code: "no_standing" }));
    expect(() => planPayment({ ...base, billingDay: 10, at: at("2026-06-01T12:00:00-03:00") })).toThrowError(expect.objectContaining({ code: "payment_too_old" }));
    expect(() => planPayment({ ...base, amountCents: -1 })).toThrow(BillingError);
  });

  it("accepts a zero amount (a courtesy month)", () => {
    expect(planPayment({ ...base, amountCents: 0 }).newUntil).toBe(day("2026-11-09"));
  });
});

describe("planVoid", () => {
  const payment = { newUntil: day("2026-11-09"), previousStatus: "pending" as const, previousUntil: null, previousMode: "paid" as const, voidedAt: null };

  it("restores the state before the payment, and the trial mode only if the payment turned it paid", () => {
    expect(planVoid({ payment, standing: { status: "current", until: day("2026-11-09") }, mode: "paid" })).toEqual({ restore: { status: "pending", until: null }, restoreMode: null });
    const fromTrial = { ...payment, previousStatus: "trial" as const, previousUntil: day("2026-10-16"), previousMode: "trial" as const };
    expect(planVoid({ payment: fromTrial, standing: { status: "current", until: day("2026-11-09") }, mode: "paid" })).toEqual({
      restore: { status: "trial", until: day("2026-10-16") }, restoreMode: "trial",
    });
    expect(planVoid({ payment: fromTrial, standing: { status: "current", until: day("2026-11-09") }, mode: "trial" }).restoreMode).toBeNull();
  });

  it("refuses a second void, and a void once the expiry or status moved", () => {
    expect(() => planVoid({ payment: { ...payment, voidedAt: 1 }, standing: { status: "current", until: day("2026-11-09") }, mode: "paid" }))
      .toThrowError(expect.objectContaining({ code: "already_voided" }));
    expect(() => planVoid({ payment, standing: { status: "current", until: day("2026-12-09") }, mode: "paid" })).toThrowError(expect.objectContaining({ code: "not_latest" }));
    expect(() => planVoid({ payment, standing: { status: "blocked", until: day("2026-11-09") }, mode: "paid" })).toThrowError(expect.objectContaining({ code: "not_latest" }));
  });
});

describe("planAssignment", () => {
  const effectiveAt = at("2026-10-09T00:00:00-03:00");
  const none = { status: "pending" as const, until: null };

  it("opens a free trial for a first assignment with trial days, and leaves the account pending without them", () => {
    expect(planAssignment({ previous: null, standing: none, trialDurationDays: 7, effectiveAt })).toEqual({
      mode: "trial", trialStartedAt: effectiveAt, trialEndsAt: effectiveAt + 7 * 86_400_000, nextStanding: { status: "trial", until: effectiveAt + 7 * 86_400_000 },
    });
    expect(planAssignment({ previous: null, standing: none, trialDurationDays: 0, effectiveAt })).toEqual({
      mode: "paid", trialStartedAt: null, trialEndsAt: null, nextStanding: { status: "pending", until: null },
    });
  });

  it("a later assignment keeps mode, trial dates, status and expiry — and never grants a second trial", () => {
    const previous = { mode: "paid" as const, trialStartedAt: effectiveAt - 86_400_000, trialEndsAt: effectiveAt - 1 };
    const standing = { status: "current" as const, until: day("2026-11-09") };
    expect(planAssignment({ previous, standing, trialDurationDays: 30, effectiveAt })).toEqual({
      mode: "paid", trialStartedAt: previous.trialStartedAt, trialEndsAt: previous.trialEndsAt, nextStanding: standing,
    });
  });

  it("an account that never trialed and never paid may still get its trial", () => {
    const previous = { mode: "paid" as const, trialStartedAt: null, trialEndsAt: null };
    expect(planAssignment({ previous, standing: none, trialDurationDays: 3, effectiveAt }).mode).toBe("trial");
    expect(planAssignment({ previous, standing: { status: "current", until: day("2026-11-09") }, trialDurationDays: 3, effectiveAt }).mode).toBe("paid");
  });

  it("falls back to pending when a previous subscription has no stored status", () => {
    const previous = { mode: "paid" as const, trialStartedAt: null, trialEndsAt: null };
    expect(planAssignment({ previous, standing: { status: null, until: null }, trialDurationDays: 0, effectiveAt }).nextStanding).toEqual({ status: "pending", until: null });
  });
});
