import { describe, expect, it } from "vitest";
import { monthlyCharge } from "../domain/payments";
import type { Workout } from "../domain/workouts";
import {
  biometricToFirestore,
  paymentToFirestore,
  toAssessment,
  toBiometric,
  toBillingPlan,
  toDraftStudent,
  toLinkedStudent,
  toPayment,
  toWorkout,
  toWorkoutLog,
  workoutToFirestore,
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

describe("toWorkout / workoutToFirestore — FirestoreMappers' workout mapping", () => {
  const workout: Workout = {
    id: "w1",
    trainerId: "trainerA",
    studentId: "s1",
    name: "Ficha A",
    isActive: true,
    exercises: [
      { name: "Supino", sets: 3, reps: "12", weight: null, restSeconds: null, notes: null, muscleActivation: { Peitoral: 1 } },
    ],
    createdAt: 5,
    status: "assigned",
    assignedAt: 6,
  };

  it("writes WorkoutEntity.toFirestoreMap's fields and reads them back", () => {
    const data = workoutToFirestore(workout, "trainerA");
    expect(data).toEqual({
      trainerId: "trainerA",
      studentId: "s1",
      name: "Ficha A",
      isActive: true,
      exercisesJson: '[{"name":"Supino","sets":3,"reps":"12","muscleActivation":{"Peitoral":1}}]',
      createdAt: 5,
      status: "assigned",
      assignedAt: 6,
    });
    expect(toWorkout("w1", data)).toEqual(workout);
  });

  it("defaults the rest and reads malformed exercisesJson as no exercises, like the Kotlin try/catch", () => {
    expect(toWorkout("w1", { studentId: "s1", name: "Ficha A", exercisesJson: "{not json" })).toEqual({
      id: "w1",
      trainerId: "",
      studentId: "s1",
      name: "Ficha A",
      isActive: true,
      exercises: [],
      createdAt: 0,
      status: "draft",
      assignedAt: null,
    });
  });

  it("skips a document without a student or a name", () => {
    expect(toWorkout("w1", { name: "Ficha A" })).toBeNull();
    expect(toWorkout("w1", { studentId: "s1", name: 7 })).toBeNull();
  });
});

describe("toBiometric / biometricToFirestore — FirestoreMappers' biometric mapping", () => {
  it("writes BiometricEntity.toFirestoreMap's fields and reads them back", () => {
    const biometric = { id: "b1", trainerId: "t1", studentId: "s1", weight: 72.5, height: 0, bodyFat: 18, date: 5 };
    const data = biometricToFirestore(biometric, "t1");
    expect(data).toEqual({ trainerId: "t1", studentId: "s1", weight: 72.5, height: 0, bodyFat: 18, date: 5 });
    expect(toBiometric("b1", data)).toEqual(biometric);
  });

  it("defaults the numbers to 0, as the Kotlin mapper does, and needs a student", () => {
    expect(toBiometric("b1", { studentId: "s1", weight: "72", bodyFat: Infinity })).toEqual({
      id: "b1",
      trainerId: "",
      studentId: "s1",
      weight: 0,
      height: 0,
      bodyFat: 0,
      date: 0,
    });
    expect(toBiometric("b1", { weight: 72 })).toBeNull();
  });
});

describe("toAssessment — FirestoreMappers.toAssessmentEntity", () => {
  it("reads a student's submission", () => {
    expect(
      toAssessment("a1", {
        studentId: "s1",
        trainerId: "t1",
        submittedAt: 9,
        parQAnswersJson: '{"medication":true}',
        goal: "Hipertrofia",
        experienceLevel: "Interm.",
        trainingDays: ["Terça"],
      }),
    ).toEqual({
      id: "a1",
      studentId: "s1",
      trainerId: "t1",
      submittedAt: 9,
      parQAnswers: { medication: true },
      goal: "Hipertrofia",
      experienceLevel: "Interm.",
      trainingDays: ["Terça"],
    });
  });

  it("needs both the student and the trainer, and defaults the rest", () => {
    expect(toAssessment("a1", { studentId: "s1" })).toBeNull();
    expect(toAssessment("a1", { trainerId: "t1" })).toBeNull();
    expect(toAssessment("a1", { studentId: "s1", trainerId: "t1", trainingDays: [1] })).toMatchObject({
      submittedAt: 0,
      parQAnswers: {},
      goal: "",
      trainingDays: [],
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
