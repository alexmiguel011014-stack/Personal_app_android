import { decodeParQAnswers, type Assessment } from "../domain/assessments";
import type { Biometric } from "../domain/biometrics";
import { decodeExercises, encodeExercises } from "../domain/exercise";
import type { WorkoutLogDoc } from "../domain/metrics";
import type { FichaMembership, Workout } from "../domain/workouts";
import type { BillingPlan, Payment, PaymentMethod, PaymentSource } from "../domain/payments";
import type { Schedule } from "../domain/schedules";
import type { DraftStudentDoc, LinkedStudentDoc } from "../domain/students";
import { ACTIVITY_KINDS, emptyActions, type ActivityKind } from "../domain/activity";

// GOALS.md §23e: Firestore document ⇄ domain type, mirroring FirestoreMappers.kt. Same field names,
// same defaults (gender "Masculino", empty strings, trainingDays [], createdAt 0, flags false), and
// the same leniency the Android line adopted (its fieldOrNull): a field stored with the wrong type
// reads as its default instead of failing the whole screen. A document missing what identifies it
// (a student's name, a log's studentId) is skipped, as the Kotlin mappers return null for it.
//
// Readers and writers for the other collections land with the screens that use them (§23g/§23h),
// on these same conventions.

type Data = Record<string, unknown>;

export interface TrainerUser {
  id: string;
  role: "TRAINER";
  name: string;
  email: string;
  createdAt: number;
  createdBy: string | null;
  accessStatus: "active" | "suspended";
  suspendedAt: number | null;
  suspendedReason: string | null;
  platformBillingStatus?: "pending" | "trial" | "current" | "blocked";
  platformBillingUntil?: number | null;
  lastAuditId?: string | null;
}

export interface TrainerStats {
  trainerId: string;
  updatedAt: number;
  lastSeenAt: number | null;
  students: { total: number; linked: number; pending: number };
  sessions7d: number;
  adherence28d: number | null;
  quiet: number;
  pendingAssessments: number;
  billing: { month: string; activePlans: number; planCents: number; expectedCents: number; receivedCents: number; overdueCents: number };
}

export interface TrainerActivity {
  trainerId: string;
  month: string;
  updatedAt: number;
  actions: Record<ActivityKind, number>;
  activeDays: string[];
}

export type AuditAction = "trainer.create" | "trainer.suspend" | "trainer.reactivate" | "trainer.promote" | "request.reject" | "trainer.resetEmail" |
  "platform.plan.create" | "platform.plan.update" | "platform.defaults.update" | "subscription.assign" |
  "invoice.issue" | "invoice.payment" | "invoice.extend" | "trial.extend" | "payment.record" | "payment.void" | "admin.student.create" |
  "invite.create" | "invite.claim" | "invite.cancel" | "invite.resolve";

export interface AuditEntry {
  id: string;
  at: number;
  adminUid: string;
  actorUid: string;
  actorRole: "ADM" | "TRAINER" | "STUDENT";
  action: AuditAction;
  targetUid: string;
  note: string;
}

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

function object(data: Data, key: string): Data | null {
  const value = data[key];
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : null;
}

const AUDIT_ACTIONS: readonly AuditAction[] = [
  "trainer.create", "trainer.suspend", "trainer.reactivate", "trainer.promote", "request.reject", "trainer.resetEmail",
  "platform.plan.create", "platform.plan.update", "platform.defaults.update", "subscription.assign",
  "invoice.issue", "invoice.payment", "invoice.extend", "trial.extend", "payment.record", "payment.void", "admin.student.create",
  "invite.create", "invite.claim", "invite.cancel", "invite.resolve",
];

export function toTrainerUser(id: string, data: Data): TrainerUser | null {
  if (str(data, "role") !== "TRAINER") return null;
  return {
    id,
    role: "TRAINER",
    name: str(data, "name") ?? "",
    email: str(data, "email") ?? "",
    createdAt: int(data, "createdAt") ?? 0,
    createdBy: str(data, "createdBy"),
    accessStatus: data.accessStatus === "suspended" ? "suspended" : "active",
    suspendedAt: int(data, "suspendedAt"),
    suspendedReason: str(data, "suspendedReason"),
    platformBillingStatus: oneOf(data, "platformBillingStatus", ["pending", "trial", "current", "blocked"] as const) ?? undefined,
    platformBillingUntil: int(data, "platformBillingUntil"),
    lastAuditId: str(data, "lastAuditId"),
  };
}

export function toTrainerStats(_id: string, data: Data): TrainerStats | null {
  const trainerId = str(data, "trainerId");
  if (trainerId === null) return null;
  const students = object(data, "students") ?? {};
  const billing = object(data, "billing") ?? {};
  return {
    trainerId,
    updatedAt: int(data, "updatedAt") ?? 0,
    lastSeenAt: int(data, "lastSeenAt"),
    students: { total: int(students, "total") ?? 0, linked: int(students, "linked") ?? 0, pending: int(students, "pending") ?? 0 },
    sessions7d: int(data, "sessions7d") ?? 0,
    adherence28d: num(data, "adherence28d"),
    quiet: int(data, "quiet") ?? 0,
    pendingAssessments: int(data, "pendingAssessments") ?? 0,
    billing: {
      month: str(billing, "month") ?? "",
      activePlans: int(billing, "activePlans") ?? 0,
      planCents: int(billing, "planCents") ?? 0,
      expectedCents: int(billing, "expectedCents") ?? 0,
      receivedCents: int(billing, "receivedCents") ?? 0,
      overdueCents: int(billing, "overdueCents") ?? 0,
    },
  };
}

export function toTrainerActivity(_id: string, data: Data): TrainerActivity | null {
  const trainerId = str(data, "trainerId");
  const month = str(data, "month");
  if (trainerId === null || month === null) return null;
  const rawActions = object(data, "actions") ?? {};
  const actions = emptyActions();
  for (const kind of ACTIVITY_KINDS) actions[kind] = int(rawActions, kind) ?? 0;
  return { trainerId, month, updatedAt: int(data, "updatedAt") ?? 0, actions, activeDays: stringList(data, "activeDays") ?? [] };
}

export function toAuditEntry(id: string, data: Data): AuditEntry | null {
  const actorUid = str(data, "actorUid") ?? str(data, "adminUid");
  const actorRole = oneOf(data, "actorRole", ["ADM", "TRAINER", "STUDENT"] as const) ?? (str(data, "adminUid") ? "ADM" : null);
  const action = oneOf(data, "action", AUDIT_ACTIONS);
  const targetUid = str(data, "targetUid");
  const at = int(data, "at");
  if (actorUid === null || actorRole === null || action === null || targetUid === null || at === null) return null;
  return { id, at, adminUid: str(data, "adminUid") ?? actorUid, actorUid, actorRole, action, targetUid, note: str(data, "note") ?? "" };
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
    paused: bool(data, "paused") ?? false,
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
    canAddSets: bool(data, "canAddSets") ?? false,
    pendingAssessmentRequest: bool(data, "pendingAssessmentRequest") ?? false,
    paused: bool(data, "paused") ?? false,
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

/** `WorkoutLogEntity.toFirestoreMap(trainerId)` — the id stays the document id. */
export function workoutLogToFirestore(log: WorkoutLogDoc): Data {
  return {
    trainerId: log.trainerId,
    studentId: log.studentId,
    workoutId: log.workoutId,
    exerciseName: log.exerciseName,
    date: log.date,
    performedSetsJson: log.performedSetsJson,
    note: log.note,
  };
}

/**
 * GOALS.md §34, web-only: the `ficha` map of a treino. Lenient like every reader here — an object with a non-blank
 * string `id` and `name`; its numbers fall back (`createdAt` to the treino's own, `updatedAt` to that, `order` to 0).
 * Anything else (absent, a string, an array, no id) is no membership: the treino reads as a legacy one, never a throw.
 */
function ficha(value: unknown, treinoCreatedAt: number): FichaMembership | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const map = value as Data;
  const fichaId = str(map, "id");
  const name = str(map, "name");
  if (fichaId === null || fichaId.trim() === "" || name === null || name.trim() === "") return null;
  const createdAt = int(map, "createdAt") ?? treinoCreatedAt;
  return { id: fichaId, name, createdAt, updatedAt: int(map, "updatedAt") ?? createdAt, order: int(map, "order") ?? 0 };
}

/** `workouts/{id}` — FirestoreMappers.toWorkoutEntity. */
export function toWorkout(id: string, data: Data): Workout | null {
  const studentId = str(data, "studentId");
  const name = str(data, "name");
  if (studentId === null || name === null) return null;
  const createdAt = int(data, "createdAt") ?? 0;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    studentId,
    name,
    isActive: bool(data, "isActive") ?? true,
    // Malformed JSON reads as no exercises, as the Kotlin mapper's try/catch does.
    exercises: decodeExercises(str(data, "exercisesJson")),
    createdAt,
    status: data.status === "assigned" ? "assigned" : "draft",
    assignedAt: int(data, "assignedAt"),
    ficha: ficha(data.ficha, createdAt),
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
    // GOALS.md §34, web-only: written only on a treino that belongs to a ficha, so every other document is exactly
    // what the phone writes (and the phone ignores the field where it is present).
    ...(workout.ficha === null ? {} : { ficha: { ...workout.ficha } }),
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

/** `schedules/{id}` — FirestoreMappers.toScheduleEntity. */
export function toSchedule(id: string, data: Data): Schedule | null {
  const studentId = str(data, "studentId");
  if (studentId === null) return null;
  return {
    id,
    trainerId: str(data, "trainerId") ?? "",
    studentId,
    dayOfWeek: str(data, "dayOfWeek") ?? "",
    hour: str(data, "hour") ?? "",
  };
}

/** `ScheduleEntity.toFirestoreMap(trainerId)` — the id stays the document id. */
export function scheduleToFirestore(schedule: Schedule, trainerId: string): Data {
  return { trainerId, studentId: schedule.studentId, dayOfWeek: schedule.dayOfWeek, hour: schedule.hour };
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
