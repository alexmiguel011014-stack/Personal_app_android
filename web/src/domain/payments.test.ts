import { describe, expect, it } from "vitest";
import {
  dueDateFor,
  monthlyCharge,
  parseAmountCents,
  paymentId,
  paymentStatus,
  plansMissingCharge,
  type BillingPlan,
} from "./payments";

const plan: BillingPlan = {
  studentId: "s1",
  trainerId: "t1",
  amountCents: 15000,
  currency: "BRL",
  dueDay: 10,
  active: true,
  createdAt: 0,
};

describe("dueDateFor", () => {
  it("clamps the due day to the month's last day", () => {
    expect(dueDateFor("2026-09", 5)).toBe("2026-09-05");
    expect(dueDateFor("2026-09", 31)).toBe("2026-09-30");
    expect(dueDateFor("2026-02", 31)).toBe("2026-02-28");
    expect(dueDateFor("2028-02", 30)).toBe("2028-02-29");
  });
});

describe("monthlyCharge", () => {
  it("builds an unpaid manual charge with a deterministic id", () => {
    const charge = monthlyCharge(plan, "2026-09", 123);
    expect(charge).toStrictEqual({
      id: "s1_2026-09",
      trainerId: "t1",
      studentId: "s1",
      amountCents: 15000,
      currency: "BRL",
      dueDate: "2026-09-10",
      paidAt: null,
      method: null,
      source: "manual",
      externalId: null,
      note: null,
      createdAt: 123,
    });
    expect(charge.id).toBe(paymentId("s1", "2026-09"));
  });

  it("writes paidAt as an explicit null, never leaves it out", () => {
    // where("paidAt", "==", null) does not match a document that lacks the field.
    expect(Object.hasOwn(monthlyCharge(plan, "2026-09", 0), "paidAt")).toBe(true);
  });

  it.each([0, -100, 150.5, Number.NaN])("rejects amountCents %s", (amountCents) => {
    expect(() => monthlyCharge({ ...plan, amountCents }, "2026-09", 0)).toThrow();
  });

  it.each([0, 32, 1.5])("rejects dueDay %s", (dueDay) => {
    expect(() => monthlyCharge({ ...plan, dueDay }, "2026-09", 0)).toThrow();
  });
});

describe("plansMissingCharge", () => {
  it("lists the active plans with no charge for the month yet", () => {
    const plans = [plan, { ...plan, studentId: "s2" }, { ...plan, studentId: "s3", active: false }];
    expect(plansMissingCharge(plans, [{ id: "s1_2026-09" }], "2026-09").map((p) => p.studentId)).toEqual(["s2"]);
    expect(plansMissingCharge(plans, [{ id: "s1_2026-09" }, { id: "s2_2026-09" }], "2026-09")).toEqual([]);
  });
});

describe("paymentStatus", () => {
  it("is derived from paidAt and the due date", () => {
    // Due today is not late yet.
    expect(paymentStatus({ paidAt: null, dueDate: "2026-09-22" }, "2026-09-22")).toBe("pending");
    expect(paymentStatus({ paidAt: null, dueDate: "2026-09-21" }, "2026-09-22")).toBe("overdue");
    expect(paymentStatus({ paidAt: null, dueDate: "2026-09-23" }, "2026-09-22")).toBe("pending");
    expect(paymentStatus({ paidAt: 1, dueDate: "2026-01-01" }, "2026-09-22")).toBe("paid");
  });
});

describe("parseAmountCents", () => {
  it.each([
    ["150", 15000],
    ["150,5", 15050],
    ["150,50", 15050],
    // As floats, 150.1 * 100 is 15009.999… — the bug this parser exists to avoid.
    ["150,10", 15010],
    ["0,10", 10],
    ["1.234,56", 123456],
    ["1.234", 123400],
    ["12.345.678,90", 1234567890],
    ["R$ 90,00", 9000],
    ["  75 ", 7500],
    ["0", 0],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseAmountCents(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "150.50", "1,234", "1.2345", "150,", "R$"])("rejects %j", (input) => {
    expect(parseAmountCents(input)).toBeNull();
  });
});
