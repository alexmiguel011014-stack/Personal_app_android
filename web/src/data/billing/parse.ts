import { FirebaseError } from "firebase/app";
import type { BillingStatus } from "../../domain/billing/standing";

// GOALS.md §36c: the small readers every billing document goes through, written once. They were copied (with slightly
// different messages) in the platform's plan and subscription files; the aluno scope uses the same ones.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} está inválido no Firestore.`);
  return value;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} está inválido no Firestore.`);
  return value;
}

export function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} precisa ser um número inteiro igual ou maior que zero.`);
  }
  return value;
}

export function nullableTimestamp(value: unknown, label: string): number | null {
  return value === null ? null : nonNegativeInteger(value, label);
}

const BILLING_STATUSES: readonly BillingStatus[] = ["pending", "trial", "current", "blocked"];

export function billingStatusOf(value: unknown): BillingStatus | null {
  return BILLING_STATUSES.find((status) => status === value) ?? null;
}

/** An actor and a reason of at most 200 characters, trimmed — what every audited ADM action asks for. */
export function requireActorAndReason(adminUid: string, reason: string): string {
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  const normalized = reason.trim();
  if (normalized.length === 0 || normalized.length > 200) throw new Error("Informe um motivo com até 200 caracteres.");
  return normalized;
}

export function optionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Turns Firestore's permission-denied into a sentence that says what to do (publish the Rules). */
export function withRulesMessage<T>(work: () => Promise<T>, message: string): Promise<T> {
  return work().catch((error: unknown) => {
    if (error instanceof FirebaseError && (error.code === "permission-denied" || error.code === "unauthenticated")) {
      throw new Error(message);
    }
    throw error;
  });
}
