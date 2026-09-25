import { decodeExercises, encodeExercises } from "../domain/exercise";
import type { WorkoutLogDoc } from "../domain/metrics";
import type { Workout } from "../domain/workouts";
import type { BillingPlan, Payment, PaymentMethod, PaymentSource } from "../domain/payments";
import type { DraftStudentDoc, LinkedStudentDoc } from "../domain/students";

// GOALS.md §23e: Firestore document ⇄ domain type, mirroring FirestoreMappers.kt. Same field names,
// same defaults (gender "Masculino", empty strings, trainingDays [], createdAt 0, flags false), and
// the same leniency the Android line adopted (its fieldOrNull): a field stored with the wrong type
// reads as its default instead of failing the whole screen. A document missing what identifies it
// (a student's name, a log's studentId) is skipped, as the Kotlin mappers return null for it.
//
// Readers and writers for workouts, schedules, biometrics and assessments land with the screens
// that use them (§23g/§23h), on these same conventions.

type Data = Record<string, unknown>;

function str(data: Data, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

// Epoch-ms Longs on the Kotlin side: a non-integer reads as missing, as GitLive's Long decode would.
function int(data: Data, key: string): number | null {
  const value = data[key];
  return Number.isInteger(value) ? (value as number) : null;
}

function bool(data: Data, key: string): boolean | null {
  const value = data[key];
  return typeof value === "boolean" ? value : null;
}

function stringList(data: Data, key: string): string[] | null {
  const value = data[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function oneOf<T extends string>(data: Data, key: string, allowed: readonly T[]): T | null {
  const value = data[key];
  return allowed.includes(value as T) ? (value as T) : null;
}

/** `students/{id}` — FirestoreMappers.toUserEntity. */
export function toDraftStudent(id: string, data: Data): DraftStudentDoc | null {
  const name = str(data, "name");
  if (name === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    name,
    role: str(data, "role") ?? "student",
    gender: str(data, "gender") ?? "Masculino",
    phone: str(data, "phone") ?? "",
    goal: str(data, "goal") ?? "",
    experienceLevel: str(data, "experienceLevel") ?? "",
    medicalNotes: str(data, "medicalNotes") ?? "",
    trainingDays: stringList(data, "trainingDays") ?? [],
    createdAt: int(data, "createdAt") ?? 0,
  };
}

/** `users/{uid}` of a linked student — FirestoreMappers.toLinkedUserEntity. */
export function toLinkedStudent(id: string, data: Data): LinkedStudentDoc | null {
  if (str(data, "role") !== "STUDENT") return null;
  const name = str(data, "name");
  if (name === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    role: "STUDENT",
    inviteCode: str(data, "inviteCode"),
    name,
    gender: str(data, "gender") ?? "Masculino",
    phone: str(data, "phone") ?? "",
    goal: str(data, "goal") ?? "",
    experienceLevel: str(data, "experienceLevel") ?? "",
    medicalNotes: str(data, "medicalNotes") ?? "",
    trainingDays: stringList(data, "trainingDays") ?? [],
    createdAt: int(data, "createdAt") ?? 0,
    canSelfAssess: bool(data, "canSelfAssess") ?? false,
    canLogBiometrics: bool(data, "canLogBiometrics") ?? false,
    pendingAssessmentRequest: bool(data, "pendingAssessmentRequest") ?? false,
  };
}

/** `workoutLogs/{id}` — FirestoreMappers.toWorkoutLogEntity. */
export function toWorkoutLog(id: string, data: Data): WorkoutLogDoc | null {
  const studentId = str(data, "studentId");
  const workoutId = str(data, "workoutId");
  const exerciseName = str(data, "exerciseName");
  if (studentId === null || workoutId === null || exerciseName === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    studentId,
    workoutId,
    exerciseName,
    date: int(data, "date") ?? 0,
    performedSetsJson: str(data, "performedSetsJson") ?? "[]",
    note: str(data, "note"),
  };
}

/** `workouts/{id}` — FirestoreMappers.toWorkoutEntity. */
export function toWorkout(id: string, data: Data): Workout | null {
  const studentId = str(data, "studentId");
  const name = str(data, "name");
  if (studentId === null || name === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    studentId,
    name,
    isActive: bool(data, "isActive") ?? true,
    // Malformed JSON reads as no exercises, as the Kotlin mapper's try/catch does.
    exercises: decodeExercises(str(data, "exercisesJson")),
    createdAt: int(data, "createdAt") ?? 0,
    status: data.status === "assigned" ? "assigned" : "draft",
    assignedAt: int(data, "assignedAt"),
  };
}

/** `WorkoutEntity.toFirestoreMap(trainerId)` — the id stays the document id. */
export function workoutToFirestore(workout: Workout, trainerId: string): Data {
  return {
    trainerId,
    studentId: workout.studentId,
    name: workout.name,
    isActive: workout.isActive,
    exercisesJson: encodeExercises(workout.exercises),
    createdAt: workout.createdAt,
    status: workout.status,
    assignedAt: workout.assignedAt,
  };
}

const METHODS: readonly PaymentMethod[] = ["pix", "cash", "card", "transfer", "other"];
const SOURCES: readonly PaymentSource[] = ["manual", "gateway"];

/**
 * `payments/{id}`. The rules only let well-formed charges in (§23d), so a mismatch here means data
 * written outside them (the Admin SDK, a console edit) — skipped rather than shown half-read.
 */
export function toPayment(id: string, data: Data): Payment | null {
  const trainerId = str(data, "trainerId");
  const studentId = str(data, "studentId");
  const amountCents = int(data, "amountCents");
  const dueDate = str(data, "dueDate");
  const source = oneOf(data, "source", SOURCES);
  const createdAt = int(data, "createdAt");
  if (
    trainerId === null || studentId === null || amountCents === null || dueDate === null ||
    source === null || createdAt === null || data.currency !== "BRL"
  ) {
    return null;
  }
  return {
    id,
    trainerId,
    studentId,
    amountCents,
    currency: "BRL",
    dueDate,
    paidAt: int(data, "paidAt"),
    method: oneOf(data, "method", METHODS),
    source,
    externalId: str(data, "externalId"),
    note: str(data, "note"),
    createdAt,
  };
}

/**
 * Exactly the field set firestore.rules' isPayment() accepts: every field present (nulls written
 * explicitly) and no `id` field — the document id carries it, as in FirestoreMappers.kt.
 */
export function paymentToFirestore(payment: Payment): Data {
  return {
    trainerId: payment.trainerId,
    studentId: payment.studentId,
    amountCents: payment.amountCents,
    currency: payment.currency,
    dueDate: payment.dueDate,
    paidAt: payment.paidAt,
    method: payment.method,
    source: payment.source,
    externalId: payment.externalId,
    note: payment.note,
    createdAt: payment.createdAt,
  };
}

/** `billingPlans/{studentId}`. */
export function toBillingPlan(id: string, data: Data): BillingPlan | null {
  const trainerId = str(data, "trainerId");
  const amountCents = int(data, "amountCents");
  const dueDay = int(data, "dueDay");
  const active = bool(data, "active");
  const createdAt = int(data, "createdAt");
  if (trainerId === null || amountCents === null || dueDay === null || active === null || createdAt === null) {
    return null;
  }
  return { studentId: id, trainerId, amountCents, currency: "BRL", dueDay, active, createdAt };
}

export function billingPlanToFirestore(plan: BillingPlan): Data {
  return { ...plan };
}
