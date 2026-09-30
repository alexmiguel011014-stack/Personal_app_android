import { describe, expect, it } from "vitest";
import { billingOwners, chargesOf, paidAtFor, parseAdjustment, parsePlanInput, plansOf } from "./billing";
import { monthlyCharge, type BillingPlan } from "./payments";
import type { Student } from "./students";

function student(id: string, name: string, linked: boolean): Student {
  return { id, name, linked, goal: "", medicalNotes: "", trainingDays: [], createdAt: 0, pendingAssessmentRequest: false };
}

function plan(studentId: string): BillingPlan {
  return { studentId, trainerId: "t1", amountCents: 15000, currency: "BRL", dueDay: 10, active: true, createdAt: 0 };
}

// Ana claimed the invite minted from draft-ana; Pedro is still a draft.
const students = [student("ana-uid", "Ana Costa", true), student("draft-pedro", "Pedro Lima", false)];
const owners = billingOwners(students, new Map([["ana-uid", "draft-ana"]]));

describe("billingOwners — billing follows the person across a claim", () => {
  it("maps a claimed draft's id to the account that claimed it", () => {
    expect(owners.get("draft-ana")).toEqual({ id: "ana-uid", name: "Ana Costa" });
    expect(owners.get("ana-uid")).toEqual({ id: "ana-uid", name: "Ana Costa" });
    expect(owners.get("draft-pedro")).toEqual({ id: "draft-pedro", name: "Pedro Lima" });
    expect(owners.get("someone-else")).toBeUndefined();
  });

  it("finds an account's plan registered before the claim, so a second one is never offered", () => {
    const plans = [plan("draft-ana"), plan("draft-pedro")];
    expect(plansOf("ana-uid", plans, owners).map((p) => p.studentId)).toEqual(["draft-ana"]);
    expect(plansOf("draft-pedro", plans, owners).map((p) => p.studentId)).toEqual(["draft-pedro"]);
  });

  it("gathers a student's charges from both ids, newest first", () => {
    const before = monthlyCharge(plan("draft-ana"), "2026-08", 0);
    const after = monthlyCharge(plan("ana-uid"), "2026-09", 0);
    const pedro = monthlyCharge(plan("draft-pedro"), "2026-09", 0);
    expect(chargesOf("ana-uid", [before, pedro, after], owners).map((c) => c.id)).toEqual([after.id, before.id]);
  });
});

describe("parsePlanInput", () => {
  it("takes reais in pt-BR and a due day from 1 to 31", () => {
    expect(parsePlanInput("150,00", "10")).toEqual({ amountCents: 15000, dueDay: 10 });
    expect(parsePlanInput("R$ 1.234,5", " 31 ")).toEqual({ amountCents: 123450, dueDay: 31 });
  });

  it("refuses an amount that isn't positive reais, and a due day outside 1–31", () => {
    const amountError = { error: "Informe o valor em reais, por exemplo 150,00." };
    for (const amount of ["", "abc", "0", "150.50"]) expect(parsePlanInput(amount, "10")).toEqual(amountError);
    for (const day of ["", "0", "32", "1.5", "dez"]) {
      expect(parsePlanInput("150", day)).toEqual({ error: "O dia do vencimento vai de 1 a 31." });
    }
  });
});

describe("paidAtFor", () => {
  const now = Date.parse("2026-09-28T15:00:00-03:00");

  it("is now when the payment was today", () => {
    expect(paidAtFor("2026-09-28", "2026-09-28", now)).toEqual({ paidAt: now });
  });

  it("is noon UTC of an earlier day — still that day on a Brazilian calendar", () => {
    expect(paidAtFor("2026-08-31", "2026-09-28", now)).toEqual({ paidAt: Date.parse("2026-08-31T12:00:00Z") });
  });

  it("refuses a future day and a day that doesn't exist", () => {
    expect(paidAtFor("2026-09-29", "2026-09-28", now)).toEqual({ error: "A data do pagamento não pode ser no futuro." });
    expect(paidAtFor("2026-02-30", "2026-09-28", now)).toEqual({ error: "Informe a data do pagamento." });
    expect(paidAtFor("", "2026-09-28", now)).toEqual({ error: "Informe a data do pagamento." });
  });
});

describe("parseAdjustment", () => {
  const charge = { dueDate: "2026-09-10" };

  it("takes a new amount and a due date in the same month", () => {
    expect(parseAdjustment(charge, "120,00", "2026-09-15")).toEqual({ amountCents: 12000, dueDate: "2026-09-15" });
  });

  it("refuses moving the due date to another month — the charge's id carries its month", () => {
    expect(parseAdjustment(charge, "120", "2026-10-01")).toEqual({
      error: "O vencimento precisa continuar no mesmo mês da cobrança.",
    });
  });

  it("refuses a bad amount or date", () => {
    expect(parseAdjustment(charge, "0", "2026-09-15")).toEqual({ error: "Informe o valor em reais, por exemplo 150,00." });
    expect(parseAdjustment(charge, "120", "2026-09-31")).toEqual({ error: "Informe o vencimento." });
  });
});
