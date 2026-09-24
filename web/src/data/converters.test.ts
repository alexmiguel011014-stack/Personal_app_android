import { describe, expect, it } from "vitest";
import { monthlyCharge } from "../domain/payments";
import {
  paymentToFirestore,
  toBillingPlan,
  toDraftStudent,
  toLinkedStudent,
  toPayment,
  toWorkoutLog,
} from "./converters";

describe("toDraftStudent / toLinkedStudent — FirestoreMappers' defaults and leniency", () => {
  it("fills FirestoreMappers' defaults for missing fields", () => {
    expect(toDraftStudent("d1", { name: "Maria" })).toEqual({
      id: "d1",
      trainerId: "",
      name: "Maria",
      role: "student",
      gender: "Masculino",
      phone: "",
      goal: "",
      experienceLevel: "",
      medicalNotes: "",
      trainingDays: [],
      createdAt: 0,
    });
  });

  it("reads a wrongly-typed field as its default instead of failing", () => {
    const draft = toDraftStudent("d1", { name: "Maria", gender: 5, createdAt: 1.5, trainingDays: "Segunda" });
    expect(draft).toMatchObject({ gender: "Masculino", createdAt: 0, trainingDays: [] });
  });

  it("skips a document without a name, as the Kotlin mapper returns null", () => {
    expect(toDraftStudent("d1", { name: 42 })).toBeNull();
  });

  it("only accepts linked accounts with role STUDENT (uppercase), with the §17 flags defaulting off", () => {
    expect(toLinkedStudent("u1", { role: "student", name: "Maria" })).toBeNull();
    expect(toLinkedStudent("u1", { role: "STUDENT", name: "Maria", inviteCode: "INV1" })).toMatchObject({
      inviteCode: "INV1",
      canSelfAssess: false,
      canLogBiometrics: false,
      pendingAssessmentRequest: false,
    });
    expect(toLinkedStudent("u1", { role: "STUDENT", name: "Maria" })?.inviteCode).toBeNull();
  });
});

describe("toWorkoutLog", () => {
  it("requires what identifies a log and defaults the rest", () => {
    expect(toWorkoutLog("l1", { studentId: "s1", workoutId: "w1" })).toBeNull();
    expect(toWorkoutLog("l1", { studentId: "s1", workoutId: "w1", exerciseName: "Supino" })).toMatchObject({
      date: 0,
      performedSetsJson: "[]",
      note: null,
    });
  });
});

describe("payments and billingPlans", () => {
  const plan = {
    studentId: "s1",
    trainerId: "t1",
    amountCents: 15000,
    currency: "BRL" as const,
    dueDay: 10,
    active: true,
    createdAt: 1,
  };

  it("writes exactly the field set the rules accept: all eleven, nulls explicit, no id", () => {
    const written = paymentToFirestore(monthlyCharge(plan, "2026-09", 2));
    expect(Object.keys(written).sort()).toEqual(
      ["amountCents", "createdAt", "currency", "dueDate", "externalId", "method", "note", "paidAt", "source", "studentId", "trainerId"],
    );
    expect(written.paidAt).toBeNull();
  });

  it("round-trips a charge", () => {
    const charge = monthlyCharge(plan, "2026-09", 2);
    expect(toPayment(charge.id, paymentToFirestore(charge))).toEqual(charge);
  });

  it("skips a charge written outside the rules rather than showing it half-read", () => {
    const written = paymentToFirestore(monthlyCharge(plan, "2026-09", 2));
    expect(toPayment("x", { ...written, currency: "USD" })).toBeNull();
    expect(toPayment("x", { ...written, amountCents: 150.5 })).toBeNull();
  });

  it("reads a plan's studentId from its document id", () => {
    const { trainerId, amountCents, currency, dueDay, active, createdAt } = plan;
    expect(toBillingPlan("s1", { trainerId, amountCents, currency, dueDay, active, createdAt })).toEqual(plan);
  });
});
