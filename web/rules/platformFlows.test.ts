import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAdminRecoveryDraft } from "../src/data/adminCreateStudent";
import {
  cancelWebsiteInvite,
  createWebsiteInvite,
  loadWebsiteInviteUsage,
  WebsiteInviteLimitError,
} from "../src/data/platformInvites";
import {
  createPlatformPlanTemplate,
  updatePlatformPlanTemplate,
} from "../src/data/platformPlans";
import {
  assignPlatformSubscription,
  extendPlatformInvoiceDueDate,
  extendPlatformTrial,
  issuePlatformInvoice,
  loadPlatformBillingUsage,
  loadPlatformSubscription,
  loadTrainerPlatformPayments,
  recordPlatformInvoicePayment,
  recordPlatformPayment,
  voidPlatformPayment,
} from "../src/data/platformSubscriptions";
import { addDays, addMonths, localDate } from "../src/domain/dates";
import { nextPaidThrough } from "../src/domain/mensalidades";
import { isDeadlineExpired } from "../src/domain/platformBilling";
import { emptyProfile } from "../src/domain/studentProfile";
import type { DraftStudentDoc } from "../src/domain/students";

const PROJECT_ID = "demo-personal-tracker";
const RULES_FILE = process.env.RULES_FILE ?? fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let env: RulesTestEnvironment;
let appNumber = 0;
const apps: FirebaseApp[] = [];

type Db = Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_FILE, "utf8") },
  });
});

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/** A modular SDK client bound to the emulator and a synthetic authenticated UID. */
function signedInAs(uid: string): Db {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator" }, `platform-flow-${appNumber++}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081").split(":");
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, email_verified: true } });
  return db;
}

async function signedInIdentity(role: "ADM" | "TRAINER" = "ADM"): Promise<{ db: Db; functions: Functions; uid: string }> {
  const number = appNumber++;
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator" }, `platform-callable-${number}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, `synthetic-${number}@example.test`, "EmulatorOnly-123!");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8081);
  const functions = getFunctions(app, "southamerica-east1");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  await seed({ [`users/${credential.user.uid}`]: { role } });
  return { db, functions, uid: credential.user.uid };
}

/** Seed isolated synthetic records without weakening the rules used by the tested clients. */
async function seed(documents: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries(documents).map(([path, data]) => db.doc(path).set(data)));
  });
}

const template = {
  name: "Plano de teste",
  monthlyBaseCents: 10_000,
  includedStudentSeats: 1,
  extraStudentMonthlyCents: 500,
  maxActiveInviteCodes: 1,
  trialDurationDays: 14,
};

function subscription(trainerUid: string, now = Date.now()) {
  return {
    trainerUid,
    mode: "paid",
    terms: {
      monthlyBaseCents: 10_000,
      includedStudentSeats: 10,
      extraStudentMonthlyCents: 500,
      maxActiveInviteCodes: 1,
          trialDurationDays: 14,
      snapshotVersion: 1,
      templateId: "basic",
      templateVersion: 1,
    },
    overrides: {},
    chargeDuringTrial: false,
    effectiveAt: now,
    trialStartedAt: null,
    trialEndsAt: null,
    currentInvoiceId: null,
    updatedAt: now,
  };
}

function draft(id: string): DraftStudentDoc {
  return {
    id,
    trainerId: "trainerA",
    name: `Aluno ${id}`,
    role: "student",
    gender: "Feminino",
    phone: "",
    goal: "",
    experienceLevel: "Iniciante",
    medicalNotes: "",
    trainingDays: ["Segunda"],
    createdAt: 1_800_000_000_000,
    paused: false,
  };
}

describe("platform billing flows (GOALS.md §35)", () => {
  it("versions templates, snapshots assigned terms and starts the account locked until the first payment", async () => {
    const now = Date.now();
    await seed({
      "users/trainerA": { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null },
    });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    expect(created.version).toBe(1);

    const assigned = await assignPlatformSubscription(admin.db, admin.uid, "trainerA", {
      templateId: created.id,
      terms: { ...template, trialDurationDays: 0 },
      effectiveAt: now - 1_000,
    });
    expect(assigned).toMatchObject({ mode: "paid", chargeDuringTrial: false, trialEndsAt: null });
    expect(assigned.terms).toMatchObject({ snapshotVersion: 1, templateVersion: 1, monthlyBaseCents: 10_000, planName: "Plano de teste" });
    expect((await getDoc(doc(admin.db, "users", "trainerA"))).data())
      .toMatchObject({ platformBillingStatus: "pending", platformBillingUntil: null });

    const updatedTemplate = await updatePlatformPlanTemplate(admin.db, admin.uid, created.id, { ...template, monthlyBaseCents: 20_000 });
    expect(updatedTemplate.version).toBe(2);
    expect((await loadPlatformSubscription(admin.db, "trainerA")).subscription?.terms)
      .toMatchObject({ templateVersion: 1, monthlyBaseCents: 10_000 });
    // The old template document may carry the removed field; rewriting it drops it.
    expect((await getDoc(doc(admin.db, "platformPlanTemplates", created.id))).data()).not.toHaveProperty("trialMaxStudentSeats");
  });

  it("records a payment, opens the access for one month and keeps counting from the expiry when paid early", async () => {
    const now = Date.now();
    await seed({ "users/trainerA": { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null } });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    await assignPlatformSubscription(admin.db, admin.uid, "trainerA", { templateId: created.id, terms: { ...template, trialDurationDays: 0 }, effectiveAt: now - 1_000 });

    const first = await recordPlatformPayment(admin.db, admin.uid, "trainerA", { amountCents: 10_000, reference: "PIX sintético", expected: { status: "pending", until: null } });
    expect(first.paidThroughDate).toBe(nextPaidThrough(Date.now(), null).date);
    expect((await getDoc(doc(admin.db, "users", "trainerA"))).data())
      .toMatchObject({ platformBillingStatus: "current", platformBillingUntil: first.newUntil });

    const second = await recordPlatformPayment(admin.db, admin.uid, "trainerA", { amountCents: 10_000, reference: "", expected: { status: "current", until: first.newUntil } });
    expect(second.paidThroughDate).toBe(addMonths(first.paidThroughDate, 1));

    // A screen that is out of date writes nothing.
    await expect(recordPlatformPayment(admin.db, admin.uid, "trainerA", { amountCents: 10_000, reference: "", expected: { status: "current", until: first.newUntil } }))
      .rejects.toThrow(/atualizado em outro lugar/i);
    expect((await loadTrainerPlatformPayments(admin.db, "trainerA")).filter((payment) => payment.voidedAt === null)).toHaveLength(2);
  });

  it("counts a payment made during the trial from the trial's end, turns the subscription paid, and a void restores the trial", async () => {
    const now = Date.now();
    await seed({ "users/trainerB": { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null } });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    const trial = await assignPlatformSubscription(admin.db, admin.uid, "trainerB", {
      templateId: created.id,
      terms: { ...template, trialDurationDays: 14 },
      effectiveAt: now - 1_000,
    });
    expect(trial.mode).toBe("trial");
    const trialEndsAt = trial.trialEndsAt as number;
    expect((await getDoc(doc(admin.db, "users", "trainerB"))).data())
      .toMatchObject({ platformBillingStatus: "trial", platformBillingUntil: trialEndsAt });

    const extended = await extendPlatformTrial(admin.db, admin.uid, "trainerB", 4, "Prorrogar teste sintético");
    expect(extended.trialEndsAt).toBe(trialEndsAt + 4 * 86_400_000);

    const payment = await recordPlatformPayment(admin.db, admin.uid, "trainerB", { amountCents: 10_000, reference: "", expected: { status: "trial", until: extended.trialEndsAt } });
    expect(payment.paidThroughDate).toBe(addMonths(localDate(extended.trialEndsAt as number), 1));
    expect(payment.previousMode).toBe("trial");
    expect((await loadPlatformSubscription(admin.db, "trainerB")).subscription?.mode).toBe("paid");

    await voidPlatformPayment(admin.db, admin.uid, payment.id, "Registrado por engano");
    expect((await loadPlatformSubscription(admin.db, "trainerB")).subscription?.mode).toBe("trial");
    expect((await getDoc(doc(admin.db, "users", "trainerB"))).data())
      .toMatchObject({ platformBillingStatus: "trial", platformBillingUntil: extended.trialEndsAt });
    await expect(voidPlatformPayment(admin.db, admin.uid, payment.id, "Outra vez")).rejects.toThrow(/já foi estornado/i);
  });

  it("never grants a second trial and keeps status and expiry when the plan is swapped", async () => {
    const now = Date.now();
    await seed({ "users/trainerC": { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null } });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    const first = await assignPlatformSubscription(admin.db, admin.uid, "trainerC", { templateId: created.id, terms: { ...template, trialDurationDays: 7 }, effectiveAt: now - 1_000 });
    await recordPlatformPayment(admin.db, admin.uid, "trainerC", { amountCents: 10_000, reference: "", expected: { status: "trial", until: first.trialEndsAt } });
    const before = (await getDoc(doc(admin.db, "users", "trainerC"))).data();

    const second = await assignPlatformSubscription(admin.db, admin.uid, "trainerC", { templateId: created.id, terms: { ...template, monthlyBaseCents: 30_000, trialDurationDays: 30 }, effectiveAt: now - 500 });
    expect(second.terms).toMatchObject({ snapshotVersion: 2, monthlyBaseCents: 30_000 });
    expect(second.mode).toBe("paid");
    expect((await getDoc(doc(admin.db, "users", "trainerC"))).data())
      .toMatchObject({ platformBillingStatus: "current", platformBillingUntil: before?.platformBillingUntil });
  });

  it("restores a blocked trainer to current only through a payment, not through a plan swap", async () => {
    const now = Date.now();
    const lapsed = now - 2 * 86_400_000;
    await seed({ "users/trainerD": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: lapsed } });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    await seed({ "platformSubscriptions/trainerD": { ...subscription("trainerD", now), terms: { ...subscription("trainerD", now).terms, templateId: created.id } } });

    await assignPlatformSubscription(admin.db, admin.uid, "trainerD", { templateId: created.id, terms: { ...template }, effectiveAt: now - 1_000 });
    expect((await getDoc(doc(admin.db, "users", "trainerD"))).data())
      .toMatchObject({ platformBillingStatus: "current", platformBillingUntil: lapsed });

    const payment = await recordPlatformPayment(admin.db, admin.uid, "trainerD", { amountCents: 10_000, reference: "", expected: { status: "current", until: lapsed } });
    expect(payment.paidThroughDate).toBe(nextPaidThrough(Date.now(), null).date);
    expect((await getDoc(doc(admin.db, "users", "trainerD"))).data()?.platformBillingUntil).toBeGreaterThan(Date.now());
  });

  it("refuses a void once something later changed the expiry", async () => {
    const now = Date.now();
    await seed({ "users/trainerE": { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null } });
    const admin = await signedInIdentity();
    const created = await createPlatformPlanTemplate(admin.db, admin.uid, template);
    await assignPlatformSubscription(admin.db, admin.uid, "trainerE", { templateId: created.id, terms: { ...template, trialDurationDays: 0 }, effectiveAt: now - 1_000 });
    const first = await recordPlatformPayment(admin.db, admin.uid, "trainerE", { amountCents: 10_000, reference: "", expected: { status: "pending", until: null } });
    await recordPlatformPayment(admin.db, admin.uid, "trainerE", { amountCents: 10_000, reference: "", expected: { status: "current", until: first.newUntil } });
    await expect(voidPlatformPayment(admin.db, admin.uid, first.id, "Tentativa fora de ordem")).rejects.toThrow(/último pagamento/i);
  });
});

describe("privacy-safe platform billing callable", () => {
  it("counts linked students and active invite reservations without returning invite or health fields", async () => {
    const now = Date.now();
    const admin = await signedInIdentity();
    const assignedSubscription = subscription("trainerA", now);
    assignedSubscription.terms.includedStudentSeats = 1;
    await seed({
      "users/trainerA": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null },
      "users/studentA": { role: "STUDENT", trainerId: "trainerA", medicalNotes: "student-medical-secret" },
      "platformSubscriptions/trainerA": assignedSubscription,
      "invites/ACTIVE01": {
        trainerId: "trainerA", used: false, createdAt: now, expiresAt: null, cancelledAt: null, revokedAt: null,
        name: "invite-name-secret", phone: "invite-phone-secret", medicalNotes: "invite-medical-secret",
      },
      "invites/CANCEL01": { trainerId: "trainerA", used: false, cancelledAt: now, expiresAt: null },
      "invites/REVOKE01": { trainerId: "trainerA", used: false, revokedAt: now, expiresAt: null },
      "invites/EXPIRE01": { trainerId: "trainerA", used: false, expiresAt: now - 1 },
      "invites/CLAIMED1": { trainerId: "trainerA", used: true, expiresAt: null },
    });

    const usage = await loadPlatformBillingUsage(admin.functions, "trainerA");
    expect(usage).toMatchObject({
      linkedStudentSeats: 1,
      reservedInviteSeats: 1,
      billableStudentSeats: 2,
      extraStudentSeats: 1,
      amountCents: 10_500,
    });
    const payload = JSON.stringify(usage);
    expect(payload).not.toContain("ACTIVE01");
    expect(payload).not.toContain("invite-name-secret");
    expect(payload).not.toContain("invite-phone-secret");
    expect(payload).not.toContain("invite-medical-secret");
    expect(payload).not.toContain("student-medical-secret");

    const dueDate = addDays(localDate(Date.now()), 1);
    const attempts = await Promise.allSettled([
      issuePlatformInvoice(admin.functions, "trainerA", dueDate, "Emissão concorrente sintética"),
      issuePlatformInvoice(admin.functions, "trainerA", dueDate, "Emissão concorrente sintética"),
    ]);
    const saved = attempts.filter((result) => result.status === "fulfilled");
    expect(saved).toHaveLength(1);
    if (saved[0]?.status !== "fulfilled") throw new Error("A emissão concorrente não criou uma fatura.");
    expect(saved[0].value).toMatchObject({
      linkedStudentSeats: 1,
      reservedInviteSeats: 1,
      billableStudentSeats: 2,
      extraStudentSeats: 1,
      amountCents: 10_500,
    });
    expect(JSON.stringify(saved[0].value)).not.toContain("invite-medical-secret");
    const stored = (await getDoc(doc(admin.db, "platformInvoices", saved[0].value.id))).data();
    expect(stored).toMatchObject({ linkedStudentSeats: 1, reservedInviteSeats: 1, billableStudentSeats: 2 });
    const audits = await getDocs(query(collection(admin.db, "adminAudit"), where("action", "==", "invoice.issue")));
    expect(audits.size).toBe(1);
    const auditId = audits.docs[0]?.id;
    expect(auditId).toBeTruthy();
    expect(stored?.lastAuditId).toBe(auditId);
    expect((await getDoc(doc(admin.db, "platformSubscriptions", "trainerA"))).get("lastAuditId")).toBe(auditId);
    expect((await getDoc(doc(admin.db, "users", "trainerA"))).get("lastAuditId")).toBe(auditId);
    expect(audits.docs[0]?.data()).toMatchObject({
      targetUid: "trainerA",
      invoiceId: saved[0].value.id,
      billingFromStatus: "current",
      billingToStatus: "current",
    });
  });

  it("keeps a claimed reservation as one billable seat and refuses malformed expiry data", async () => {
    const now = Date.now();
    const admin = await signedInIdentity();
    await seed({
      "users/trainerA": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null },
      "platformSubscriptions/trainerA": subscription("trainerA", now),
      "invites/CLAIMME1": { trainerId: "trainerA", used: false, expiresAt: null, cancelledAt: null, revokedAt: null },
    });
    const before = await loadPlatformBillingUsage(admin.functions, "trainerA");
    expect(before).toMatchObject({ linkedStudentSeats: 0, reservedInviteSeats: 1, billableStudentSeats: 1 });
    await seed({
      "invites/CLAIMME1": { trainerId: "trainerA", used: true, expiresAt: null, cancelledAt: null, revokedAt: null },
      "users/studentClaimed": { role: "STUDENT", trainerId: "trainerA" },
    });
    const after = await loadPlatformBillingUsage(admin.functions, "trainerA");
    expect(after).toMatchObject({ linkedStudentSeats: 1, reservedInviteSeats: 0, billableStudentSeats: 1 });

    await seed({
      "invites/BADDATE1": { trainerId: "trainerA", used: false, expiresAt: "not-a-timestamp", cancelledAt: null, revokedAt: null },
    });
    await expect(loadPlatformBillingUsage(admin.functions, "trainerA")).rejects.toThrow(/invalid|vencimento/i);
    await expect(issuePlatformInvoice(
      admin.functions,
      "trainerA",
      addDays(localDate(Date.now()), 1),
      "Não emitir com vencimento inválido",
    )).rejects.toThrow(/invalid|vencimento/i);
  });

  it("keeps an active charged trial through invoice issue and payment, capped at its trial deadline", async () => {
    const now = Date.now();
    const admin = await signedInIdentity();
    const trialEndsAt = now + 2 * 86_400_000;
    await seed({
      "users/trainerActiveTrial": { role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: trialEndsAt },
      "platformSubscriptions/trainerActiveTrial": {
        ...subscription("trainerActiveTrial", now),
        mode: "trial",
        chargeDuringTrial: true,
        trialStartedAt: now - 12 * 86_400_000,
        trialEndsAt,
      },
    });

    const invoice = await issuePlatformInvoice(
      admin.functions,
      "trainerActiveTrial",
      addDays(localDate(Date.now()), 1),
      "Fatura durante teste sintético",
    );
    expect(invoice.status).toBe("unpaid");
    const initialInvoiceDeadline = new Date(`${invoice.dueDate}T23:59:59.999-03:00`).getTime();
    expect(initialInvoiceDeadline).toBeLessThan(trialEndsAt);
    expect((await getDoc(doc(admin.db, "users", "trainerActiveTrial"))).data())
      .toMatchObject({ platformBillingStatus: "trial", platformBillingUntil: initialInvoiceDeadline });

    const extended = await extendPlatformInvoiceDueDate(
      admin.db,
      admin.uid,
      "trainerActiveTrial",
      invoice.id,
      30,
      "Prorrogar fatura sintética no teste",
    );
    expect(new Date(`${extended.dueDate}T23:59:59.999-03:00`).getTime()).toBeGreaterThan(trialEndsAt);
    expect((await getDoc(doc(admin.db, "users", "trainerActiveTrial"))).data())
      .toMatchObject({ platformBillingStatus: "trial", platformBillingUntil: trialEndsAt });

    await recordPlatformInvoicePayment(admin.db, admin.uid, "trainerActiveTrial", invoice.id, "Pagamento sintético durante teste");
    const afterPayment = (await getDoc(doc(admin.db, "users", "trainerActiveTrial"))).data();
    expect(afterPayment).toMatchObject({ platformBillingStatus: "trial", platformBillingUntil: trialEndsAt });
    expect(isDeadlineExpired(afterPayment?.platformBillingUntil as number, trialEndsAt)).toBe(true);
  });

  it("keeps an expired charged trial blocked through invoice extension and payment until a paid plan is assigned", async () => {
    const now = Date.now();
    const admin = await signedInIdentity();
    const trialEndsAt = now - 1_000;
    await seed({
      "users/trainerExpired": { role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: trialEndsAt },
      "platformPlanTemplates/basic": {
        name: "Básico", monthlyBaseCents: 10_000, includedStudentSeats: 5, extraStudentMonthlyCents: 500,
        maxActiveInviteCodes: 5, trialDurationDays: 14, version: 1,
      },
      "platformSubscriptions/trainerExpired": {
        ...subscription("trainerExpired", now),
        mode: "trial",
        chargeDuringTrial: true,
        trialStartedAt: now - 15 * 86_400_000,
        trialEndsAt,
      },
    });

    const invoice = await issuePlatformInvoice(
      admin.functions,
      "trainerExpired",
      addDays(localDate(Date.now()), 1),
      "Fatura para teste expirado sintético",
    );
    expect(invoice.status).toBe("unpaid");
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "blocked", platformBillingUntil: trialEndsAt });

    const reassignmentTerms = {
      monthlyBaseCents: 10_000, includedStudentSeats: 5, extraStudentMonthlyCents: 500,
      maxActiveInviteCodes: 5, trialDurationDays: 14,
    };
    await expect(assignPlatformSubscription(admin.db, admin.uid, "trainerExpired", {
      templateId: "basic", terms: reassignmentTerms, effectiveAt: Date.now() - 1_000,
    })).rejects.toThrow(/fatura pendente/i);
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "blocked", platformBillingUntil: trialEndsAt });

    await extendPlatformInvoiceDueDate(
      admin.db,
      admin.uid,
      "trainerExpired",
      invoice.id,
      30,
      "Prorrogar fatura após trial sintético",
    );
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "blocked", platformBillingUntil: trialEndsAt });

    await recordPlatformInvoicePayment(admin.db, admin.uid, "trainerExpired", invoice.id, "Pagamento sintético");
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "blocked", platformBillingUntil: trialEndsAt });

    await assignPlatformSubscription(admin.db, admin.uid, "trainerExpired", {
      templateId: "basic",
      terms: reassignmentTerms,
      effectiveAt: Date.now() - 1_000,
    });
    // Swapping the plan does not unlock an expired account; a recorded payment does.
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "blocked", platformBillingUntil: trialEndsAt });
    await recordPlatformPayment(admin.db, admin.uid, "trainerExpired", {
      amountCents: 10_000, reference: "", expected: { status: "blocked", until: trialEndsAt },
    });
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data())
      .toMatchObject({ platformBillingStatus: "current" });
    expect((await getDoc(doc(admin.db, "users", "trainerExpired"))).data()?.platformBillingUntil).toBeGreaterThan(Date.now());
  });

  it("rejects a signed-in trainer querying another trainer's billing summary", async () => {
    const caller = await signedInIdentity("TRAINER");
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "platformSubscriptions/trainerA": subscription("trainerA"),
    });
    await expect(loadPlatformBillingUsage(caller.functions, "trainerA")).rejects.toThrow(/ADM|permission/i);
  });
});

describe("cooperating website invite capacity", () => {
  it("allows only one concurrent website creation, frees capacity on cancellation, and counts a legacy invite without expiry", async () => {
    const now = Date.now();
    await seed({
      "users/trainerA": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null },
      "platformSubscriptions/trainerA": subscription("trainerA", now),
    });

    const [firstDb, secondDb] = [signedInAs("trainerA"), signedInAs("trainerA")];
    const attempts = await Promise.allSettled([
      createWebsiteInvite(firstDb, "trainerA", draft("draft-one"), now, 0, () => "A1B2C3D4"),
      createWebsiteInvite(secondDb, "trainerA", draft("draft-two"), now, 0, () => "B1C2D3E4"),
    ]);
    const successes = attempts.filter((result) => result.status === "fulfilled");
    const failures = attempts.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0]?.status === "rejected") expect(failures[0].reason).toBeInstanceOf(Error);

    const created = successes[0];
    if (created?.status !== "fulfilled") throw new Error("A criação concorrente não produziu convite.");
    const usageDb = firstDb;
    expect((await loadWebsiteInviteUsage(usageDb, "trainerA", now)).activeInviteCodes).toBe(1);
    await cancelWebsiteInvite(usageDb, "trainerA", created.value.code, now + 1);
    expect((await loadWebsiteInviteUsage(usageDb, "trainerA", now + 1)).activeInviteCodes).toBe(0);

    await seed({
      "invites/DEADBEEF": { trainerId: "trainerA", used: false, createdAt: now - 10 },
    });
    expect((await loadWebsiteInviteUsage(usageDb, "trainerA", now + 1)).activeInviteCodes).toBe(1);
    await expect(
      createWebsiteInvite(usageDb, "trainerA", draft("draft-three"), now + 1, 0, () => "C1D2E3F4"),
    ).rejects.toBeInstanceOf(WebsiteInviteLimitError);
  });
});

describe("ADM recovery student draft", () => {
  it("writes the student and audit together, and denies missing-plan, suspended, blocked, and expired-trial accounts", async () => {
    const now = Date.now();
    await seed({
      "users/adminA": { role: "ADM" },
      "users/trainerA": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null },
      "users/trainerMissingPlan": { role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null },
      "users/trainerSuspended": { role: "TRAINER", accessStatus: "suspended", platformBillingStatus: "current", platformBillingUntil: null },
      "users/trainerBlocked": { role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: now - 1 },
      "users/trainerExpiredTrial": { role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: null },
      "platformSubscriptions/trainerA": subscription("trainerA", now),
      "platformSubscriptions/trainerSuspended": subscription("trainerSuspended", now),
      "platformSubscriptions/trainerBlocked": subscription("trainerBlocked", now),
      "platformSubscriptions/trainerExpiredTrial": {
        ...subscription("trainerExpiredTrial", now),
        mode: "trial",
        trialStartedAt: now - 2 * 86_400_000,
        trialEndsAt: now - 1,
      },
    });
    const adminDb = signedInAs("adminA");
    const trainerDb = signedInAs("trainerA");
    const profile = { ...emptyProfile(), name: "Aluno de recuperação", trainingDays: ["Segunda"] };
    const studentId = await createAdminRecoveryDraft(
      adminDb,
      "adminA",
      "trainerA",
      profile,
      "Cadastro de segurança sintético",
      now,
    );

    expect((await getDoc(doc(trainerDb, "students", studentId))).data())
      .toMatchObject({ trainerId: "trainerA", name: "Aluno de recuperação", role: "student" });
    expect((await getDoc(doc(adminDb, "adminAudit", studentId))).data())
      .toMatchObject({ adminUid: "adminA", action: "admin.student.create", targetUid: "trainerA", studentId });
    expect(await loadWebsiteInviteUsage(trainerDb, "trainerA", now)).toMatchObject({
      linkedStudentSeats: 0,
      pendingInviteReservations: 0,
    });

    const recovery = (trainerUid: string, name: string) => createAdminRecoveryDraft(
      adminDb,
      "adminA",
      trainerUid,
      { ...profile, name },
      "Negativa sintética",
      now,
    );
    await expect(recovery("trainerMissingPlan", "Sem plano"))
      .rejects.toThrow(/Atribua um plano ou teste/i);
    await expect(recovery("trainerSuspended", "Personal suspenso"))
      .rejects.toThrow(/bloqueada/i);
    await expect(recovery("trainerBlocked", "Personal bloqueado"))
      .rejects.toThrow(/bloqueada/i);
    await expect(recovery("trainerExpiredTrial", "Teste expirado"))
      .rejects.toThrow(/período de teste do personal terminou/i);
  });
});
