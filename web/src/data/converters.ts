import { decodeParQAnswers, type Assessment } from "../domain/assessments";
import type { Biometric } from "../domain/biometrics";
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
// Readers and writers for the other collections land with the screens that use them (§23g/§23h),
// on these same conventions.

type Data = Record<string, unknown>;

function str(data: Data, key: string): string | null {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

// Longs on the Kotlin side (epoch ms, cents). Stricter than the phone on purpose: GitLive's Long
// decode truncates any number (decoders.kt), while a non-integer reads as missing here — for money
// that's the point, and no client writes a fractional timestamp.
function int(data: Data, key: string): number | null {
  const value = data[key];
  return Number.isInteger(value) ? (value as number) : null;
}

// Doubles on the Kotlin side: any finite number, integer or not.
function num(data: Data, key: string): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

/** `biometrics/{id}` — FirestoreMappers.toBiometricEntity. */
export function toBiometric(id: string, data: Data): Biometric | null {
  const studentId = str(data, "studentId");
  if (studentId === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    studentId,
    weight: num(data, "weight") ?? 0,
    height: num(data, "height") ?? 0,
    bodyFat: num(data, "bodyFat") ?? 0,
    date: int(data, "date") ?? 0,
  };
}

/** `BiometricEntity.toFirestoreMap(trainerId)` — the id stays the document id. */
export function biometricToFirestore(biometric: Biometric, trainerId: string): Data {
  return {
    trainerId,
    studentId: biometric.studentId,
    weight: biometric.weight,
    height: biometric.height,
    bodyFat: biometric.bodyFat,
    date: biometric.date,
  };
}

/** `assessments/{id}` — FirestoreMappers.toAssessmentEntity. */
export function toAssessment(id: string, data: Data): Assessment | null {
  const studentId = str(data, "studentId");
  const trainerId = str(data, "trainerId");
  if (studentId === null || trainerId === null) return null;
  return {
    id,
    studentId,
    trainerId,
    submittedAt: int(data, "submittedAt") ?? 0,
    parQAnswers: decodeParQAnswers(str(data, "parQAnswersJson")),
    goal: str(data, "goal") ?? "",
    experienceLevel: str(data, "experienceLevel") ?? "",
    trainingDays: stringList(data, "trainingDays") ?? [],
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
