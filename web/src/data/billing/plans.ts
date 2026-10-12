import {
  collection,
  doc,
  getDocs,
  runTransaction,
  type Firestore,
  type Query,
  type Transaction,
} from "firebase/firestore";
import type { BillingTerms } from "../../domain/billing/terms";
import { isRecord, nonNegativeInteger, withRulesMessage } from "./parse";

// GOALS.md §36c: plan templates for either scope. The shared part is what makes a plan a plan — the name, the integer
// fields, the version that only ever goes up. Where the document lives, what else is written with it (the ADM's audit
// entry) and who owns it is the scope's.

/** One editable field of a plan. `day` is a billing day, 1–31 (or empty when `optional`). */
export interface PlanFieldSpec {
  key: string;
  /** What the form calls it. */
  label: string;
  /** What an error says, with its article: "A mensalidade precisa ser…". */
  errorLabel: string;
  kind: "cents" | "int" | "day";
  optional?: boolean;
}

/** A plan as stored and listed: flat, so a form can read `plan[field.key]`. */
export interface BillingPlanRecord extends BillingTerms {
  id: string;
  name: string;
  version: number;
  [key: string]: string | number | null | undefined;
}

/** The fields a form edits. */
export interface EditablePlan {
  name: string;
  [key: string]: string | number | null | undefined;
}

export interface PlanScope {
  collection: string;
  fields: readonly PlanFieldSpec[];
  /** The sentence shown when the Rules say no. */
  rulesMessage: string;
  /** Writes the plan document (and anything that must land with it) inside the transaction. */
  write(tx: Transaction, ctx: { db: Firestore; action: "create" | "update"; id: string; version: number; fields: Record<string, unknown> }): void;
  /** Which documents are this scope's plans. */
  query(db: Firestore): Query;
}

function validPlanName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 80) {
    throw new Error("O nome do plano precisa ter entre 1 e 80 caracteres.");
  }
  return value.trim();
}

function validField(spec: PlanFieldSpec, value: unknown): number | null {
  if (spec.optional && (value === null || value === undefined)) return null;
  const number = nonNegativeInteger(value, spec.errorLabel);
  if (spec.kind === "day" && (number < 1 || number > 31)) throw new Error(`${spec.errorLabel} precisa ficar entre 1 e 31.`);
  return number;
}

/** The normalised editable fields of a plan, or the first thing wrong with them. */
export function validatePlan(fields: readonly PlanFieldSpec[], input: Record<string, unknown>): EditablePlan {
  const validated: Record<string, unknown> = { name: validPlanName(input.name) };
  for (const spec of fields) validated[spec.key] = validField(spec, input[spec.key]);
  return validated as EditablePlan;
}

/** A stored plan document, strictly: an invalid one is an error naming it, never a silently odd plan. */
export function planFromDocument(fields: readonly PlanFieldSpec[], id: string, value: unknown): BillingPlanRecord {
  if (!isRecord(value)) throw new Error(`O modelo de plano ${id} está inválido no Firestore.`);
  try {
    const editable = validatePlan(fields, value);
    const version = nonNegativeInteger(value.version, "A versão do plano");
    if (version === 0) throw new Error("versão");
    return { ...editable, id, version } as BillingPlanRecord;
  } catch {
    throw new Error(`O modelo de plano ${id} está inválido no Firestore. Revise os campos antes de editá-lo.`);
  }
}

export function loadPlans(db: Firestore, scope: PlanScope): Promise<BillingPlanRecord[]> {
  return withRulesMessage(async () => (await getDocs(scope.query(db))).docs
    .map((snapshot) => planFromDocument(scope.fields, snapshot.id, snapshot.data()))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), scope.rulesMessage);
}

export async function createPlan(db: Firestore, scope: PlanScope, input: Record<string, unknown>): Promise<BillingPlanRecord> {
  return withRulesMessage(async () => {
    const validated = validatePlan(scope.fields, input);
    const id = doc(collection(db, scope.collection)).id;
    const created = { ...validated, id, version: 1 } as BillingPlanRecord;
    await runTransaction(db, async (tx) => {
      scope.write(tx, { db, action: "create", id, version: 1, fields: { ...validated } });
    });
    return created;
  }, scope.rulesMessage);
}

/** A transaction, so two ADM/trainer tabs editing at once always advance the stored version. */
export async function updatePlan(db: Firestore, scope: PlanScope, id: string, input: Record<string, unknown>): Promise<BillingPlanRecord> {
  return withRulesMessage(() => runTransaction(db, async (tx) => {
    const snapshot = await tx.get(doc(db, scope.collection, id));
    if (!snapshot.exists()) throw new Error("Este modelo não existe mais. Recarregue a página e tente novamente.");
    const current = planFromDocument(scope.fields, snapshot.id, snapshot.data());
    const validated = validatePlan(scope.fields, input);
    const version = nonNegativeInteger(current.version + 1, "A versão do plano");
    scope.write(tx, { db, action: "update", id, version, fields: { ...validated } });
    return { ...validated, id, version } as BillingPlanRecord;
  }), scope.rulesMessage);
}
