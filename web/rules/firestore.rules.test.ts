import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

// GOALS.md §23d: the repo-root firestore.rules — the exact file that gets published — exercised
// against the local Firestore emulator. Run with `npm run test:rules` (needs Java 21, see
// web/README.md). The project id starts with "demo-", which keeps the emulator from ever talking to
// a real Firebase project.
//
// RULES_FILE points the suite at another rules file instead — e.g. the version currently published,
// to see exactly which guarantees a candidate adds. assertFails passes on *any* failure, so running
// against the old rules is also how you prove these tests discriminate at all.
const RULES_FILE =
  process.env.RULES_FILE ?? fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let env: RulesTestEnvironment;

const TRAINER_A = "trainerA";
const TRAINER_B = "trainerB";
const STUDENT_A = "studentA"; // linked to trainerA
const STUDENT_A2 = "studentA2"; // also linked to trainerA
const OPEN_INVITE = "INV-OPEN"; // trainerA's, unused

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-personal-tracker",
    firestore: { rules: readFileSync(RULES_FILE, "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await db.doc("users/adminA").set({ role: "ADM" });
    await db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER" });
    await db.doc(`users/${TRAINER_B}`).set({ role: "TRAINER" });
    await db.doc(`users/${STUDENT_A}`).set(linkedStudent("INV-A"));
    await db.doc(`users/${STUDENT_A2}`).set(linkedStudent("INV-A2"));
    await db.doc(`invites/${OPEN_INVITE}`).set({ trainerId: TRAINER_A, used: false, createdAt: 1, draftId: "draft1" });
  });
});

type Db = ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>;

// GOALS.md §27: everyone here has a confirmed address unless a test says otherwise — that is what a
// claim now needs, and every other rule must not care either way (proved in "verified e-mail" below).
const as = (uid: string): Db => env.authenticatedContext(uid, { email_verified: true }).firestore();
const asEmail = (uid: string, email: string, email_verified = true): Db => env.authenticatedContext(uid, { email, email_verified }).firestore();
const asUnverified = (uid: string): Db => env.authenticatedContext(uid, { email_verified: false }).firestore();
/** A token with no email_verified claim at all — how these tests signed in before §27. */
const asWithoutClaim = (uid: string): Db => env.authenticatedContext(uid).firestore();
const anonymous = (): Db => env.unauthenticatedContext().firestore();

/** Writes test fixtures with the rules switched off. */
async function seed(write: (db: Db) => Promise<unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore());
  });
}

function without(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const copy = { ...data };
  delete copy[key];
  return copy;
}

function linkedStudent(inviteCode: string) {
  return {
    role: "STUDENT",
    trainerId: TRAINER_A,
    inviteCode,
    name: "Aluno",
    gender: "Feminino",
    phone: "",
    goal: "",
    experienceLevel: "",
    medicalNotes: "",
    trainingDays: [],
    createdAt: 1_700_000_000_000,
    canSelfAssess: false,
    canLogBiometrics: false,
    pendingAssessmentRequest: false,
  };
}

function platformSubscription(trainerUid: string, mode: "paid" | "trial" = "paid", trialEndsAt: number | null = null) {
  const now = Date.now();
  return {
    trainerUid,
    mode,
    terms: {
      monthlyBaseCents: 10000,
      includedStudentSeats: 10,
      extraStudentMonthlyCents: 500,
      maxActiveInviteCodes: 5,
      trialMaxStudentSeats: 2,
      trialDurationDays: 14,
      snapshotVersion: 1,
      templateId: "basic",
      templateVersion: 1,
    },
    overrides: {},
    chargeDuringTrial: false,
    effectiveAt: now,
    trialStartedAt: mode === "trial" ? now - 1000 : null,
    trialEndsAt,
    currentInvoiceId: null,
    updatedAt: now,
  };
}

describe("payments", () => {
  const ID = `${STUDENT_A}_2026-09`;

  function charge(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      trainerId: TRAINER_A,
      studentId: STUDENT_A,
      amountCents: 15000,
      currency: "BRL",
      dueDate: "2026-09-10",
      paidAt: null,
      method: null,
      source: "manual",
      externalId: null,
      note: null,
      createdAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  it("the owning trainer creates, reads, lists, marks paid and deletes", async () => {
    const db = as(TRAINER_A);
    await assertSucceeds(db.doc(`payments/${ID}`).set(charge()));
    await assertSucceeds(db.doc(`payments/${ID}`).get());
    await assertSucceeds(db.collection("payments").where("trainerId", "==", TRAINER_A).get());
    await assertSucceeds(db.doc(`payments/${ID}`).update({ paidAt: 1_700_000_100_000, method: "pix" }));
    await assertSucceeds(db.doc(`payments/${ID}`).delete());
  });

  it("nobody else reads them: not another trainer, not the student themselves, not the public", async () => {
    await seed((db) => db.doc(`payments/${ID}`).set(charge()));
    await assertFails(as(TRAINER_B).doc(`payments/${ID}`).get());
    await assertFails(as(TRAINER_B).collection("payments").where("trainerId", "==", TRAINER_A).get());
    await assertFails(as(STUDENT_A).doc(`payments/${ID}`).get());
    await assertFails(as(STUDENT_A).collection("payments").where("studentId", "==", STUDENT_A).get());
    await assertFails(anonymous().doc(`payments/${ID}`).get());
  });

  it.each([
    ["amountCents as a float", charge({ amountCents: 150.5 })],
    ["amountCents of zero", charge({ amountCents: 0 })],
    ["a currency other than BRL", charge({ currency: "USD" })],
    ["a dueDate that isn't YYYY-MM-DD", charge({ dueDate: "10/09/2026" })],
    ["month 13", charge({ dueDate: "2026-13-10" })],
    ["paidAt left out instead of null", without(charge(), "paidAt")],
    ["a stored status (status is derived, never stored)", charge({ status: "paid" })],
    ["source 'gateway' from a client", charge({ source: "gateway" })],
    ["an externalId on a manual charge", charge({ externalId: "gw_123" })],
    ["a payment method outside the list", charge({ method: "bitcoin" })],
    ["another trainer's trainerId", charge({ trainerId: TRAINER_B })],
  ])("rejects a charge with %s", async (_label, data) => {
    await assertFails(as(TRAINER_A).doc(`payments/${ID}`).set(data));
  });

  it("lets the owning trainer ask whether a charge exists yet — the read create-if-absent makes", async () => {
    await seed((db) =>
      db.doc(`billingPlans/${STUDENT_A}`).set({
        studentId: STUDENT_A,
        trainerId: TRAINER_A,
        amountCents: 15000,
        currency: "BRL",
        dueDay: 10,
        active: true,
        createdAt: 1,
      }),
    );
    await assertSucceeds(as(TRAINER_A).doc(`payments/${ID}`).get()); // not created yet
    await assertFails(as(TRAINER_B).doc(`payments/${ID}`).get());
    // No plan for this student: no answer, so no probing for other trainers' students.
    await assertFails(as(TRAINER_A).doc(`payments/${STUDENT_A2}_2026-09`).get());
  });

  it("rejects a document id that isn't {studentId}_{month of dueDate}", async () => {
    const db = as(TRAINER_A);
    await assertFails(db.doc(`payments/${STUDENT_A}_2026-10`).set(charge()));
    await assertFails(db.doc(`payments/${STUDENT_A2}_2026-09`).set(charge()));
    await assertFails(db.doc("payments/random-id").set(charge()));
  });

  it("allows moving the due day within the month, never across months or touching identity fields", async () => {
    await seed((db) => db.doc(`payments/${ID}`).set(charge()));
    const doc = as(TRAINER_A).doc(`payments/${ID}`);
    await assertSucceeds(doc.update({ dueDate: "2026-09-15" }));
    await assertFails(doc.update({ dueDate: "2026-10-05" }));
    await assertFails(doc.update({ studentId: STUDENT_A2 }));
    await assertFails(doc.update({ trainerId: TRAINER_B }));
    await assertFails(doc.update({ source: "gateway" }));
    await assertFails(doc.update({ createdAt: 1 }));
  });

  it("lets the trainer undo a mistaken 'paid'", async () => {
    await seed((db) => db.doc(`payments/${ID}`).set(charge({ paidAt: 1_700_000_100_000, method: "pix" })));
    await assertSucceeds(as(TRAINER_A).doc(`payments/${ID}`).update({ paidAt: null, method: null }));
  });

  it("leaves gateway-owned charges to the gateway", async () => {
    await seed((db) => db.doc(`payments/${ID}`).set(charge({ source: "gateway", externalId: "gw_1" })));
    const doc = as(TRAINER_A).doc(`payments/${ID}`);
    await assertSucceeds(doc.get());
    await assertFails(doc.update({ paidAt: 1_700_000_100_000 }));
    await assertFails(doc.delete());
  });

  it("a student account can't write charges, even naming itself as the trainer", async () => {
    await assertFails(as(STUDENT_A).doc(`payments/${ID}`).set(charge({ trainerId: STUDENT_A })));
  });
});

describe("billingPlans", () => {
  function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      studentId: STUDENT_A,
      trainerId: TRAINER_A,
      amountCents: 15000,
      currency: "BRL",
      dueDay: 10,
      active: true,
      createdAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  it("belongs to the owning trainer alone", async () => {
    await assertSucceeds(as(TRAINER_A).doc(`billingPlans/${STUDENT_A}`).set(plan()));
    await assertSucceeds(as(TRAINER_A).doc(`billingPlans/${STUDENT_A}`).update({ amountCents: 18000, active: false }));
    await assertFails(as(STUDENT_A).doc(`billingPlans/${STUDENT_A}`).get());
    await assertFails(as(TRAINER_B).doc(`billingPlans/${STUDENT_A}`).get());
    await assertFails(as(TRAINER_A).doc(`billingPlans/${STUDENT_A}`).update({ trainerId: TRAINER_B }));
  });

  it.each([
    ["dueDay 0", plan({ dueDay: 0 })],
    ["dueDay 32", plan({ dueDay: 32 })],
    ["a float amount", plan({ amountCents: 99.9 })],
    ["active as a string", plan({ active: "yes" })],
  ])("rejects a plan with %s", async (_label, data) => {
    await assertFails(as(TRAINER_A).doc(`billingPlans/${STUDENT_A}`).set(data));
  });

  it("requires the document id to be the studentId", async () => {
    await assertFails(as(TRAINER_A).doc("billingPlans/someoneElse").set(plan()));
  });
});

describe("trainer-owned records require the student's current trainer", () => {
  const draftStudent = "draft-only-student";
  const records = {
    workout: { trainerId: TRAINER_A, studentId: STUDENT_A, status: "draft", name: "Ficha" },
    biometric: { trainerId: TRAINER_A, studentId: STUDENT_A, weight: 70, date: 1 },
    schedule: { trainerId: TRAINER_A, studentId: STUDENT_A, dayOfWeek: "Segunda", hour: "08h" },
    billingPlan: {
      studentId: STUDENT_A, trainerId: TRAINER_A, amountCents: 15000, currency: "BRL",
      dueDay: 10, active: true, createdAt: 1,
    },
    payment: {
      trainerId: TRAINER_A, studentId: STUDENT_A, amountCents: 15000, currency: "BRL",
      dueDate: "2026-09-10", paidAt: null, method: null, source: "manual", externalId: null,
      note: null, createdAt: 1,
    },
  };

  function withStudent(record: Record<string, unknown>, studentId: string): Record<string, unknown> {
    return { ...record, studentId };
  }

  async function createAll(db: Db, studentId: string) {
    const changed = Object.fromEntries(
      Object.entries(records).map(([name, record]) => [name, withStudent(record, studentId)]),
    );
    await assertSucceeds(db.doc(`workouts/link-check-${studentId}`).set(changed.workout));
    await assertSucceeds(db.doc(`biometrics/link-check-${studentId}`).set(changed.biometric));
    await assertSucceeds(db.doc(`schedules/link-check-${studentId}`).set(changed.schedule));
    await assertSucceeds(db.doc(`billingPlans/${studentId}`).set(changed.billingPlan));
    await assertSucceeds(db.doc(`payments/${studentId}_2026-09`).set(changed.payment));
  }

  it("accepts the linked users profile and falls back to a draft only if that profile is absent", async () => {
    await createAll(as(TRAINER_A), STUDENT_A);
    await seed((db) => db.doc(`students/${draftStudent}`).set({ trainerId: TRAINER_A, name: "Pré-cadastro" }));
    await createAll(as(TRAINER_A), draftStudent);
  });

  it("rejects cross-trainer links, wrong profile roles, and missing students", async () => {
    await seed(async (db) => {
      await db.doc("users/wrong-trainer").set({ role: "STUDENT", trainerId: TRAINER_B });
      await db.doc("users/wrong-role").set({ role: "TRAINER", trainerId: TRAINER_A });
      // A matching draft must not override an existing but mismatched user profile.
      await db.doc("students/wrong-trainer").set({ trainerId: TRAINER_A });
      await db.doc("students/wrong-role").set({ trainerId: TRAINER_A });
    });
    const db = as(TRAINER_A);
    for (const studentId of ["wrong-trainer", "wrong-role", "missing-student"]) {
      await assertFails(db.doc("workouts/link-rejected").set(withStudent(records.workout, studentId)));
      await assertFails(db.doc("biometrics/link-rejected").set(withStudent(records.biometric, studentId)));
      await assertFails(db.doc("schedules/link-rejected").set(withStudent(records.schedule, studentId)));
      await assertFails(db.doc(`billingPlans/${studentId}`).set(withStudent(records.billingPlan, studentId)));
      await assertFails(db.doc(`payments/${studentId}_2026-09`).set(withStudent(records.payment, studentId)));
    }
  });

  it("keeps trainerId and studentId immutable on updates for all five collections", async () => {
    await seed(async (db) => {
      await db.doc("workouts/immutable").set(records.workout);
      await db.doc("biometrics/immutable").set(records.biometric);
      await db.doc("schedules/immutable").set(records.schedule);
      await db.doc(`billingPlans/${STUDENT_A}`).set(records.billingPlan);
      await db.doc(`payments/${STUDENT_A}_2026-09`).set(records.payment);
    });
    const db = as(TRAINER_A);
    for (const collection of ["workouts", "biometrics", "schedules"]) {
      const record = db.doc(`${collection}/immutable`);
      await assertFails(record.update({ trainerId: TRAINER_B }));
      await assertFails(record.update({ studentId: STUDENT_A2 }));
    }
    for (const path of [`billingPlans/${STUDENT_A}`, `payments/${STUDENT_A}_2026-09`]) {
      const record = db.doc(path);
      await assertFails(record.update({ trainerId: TRAINER_B }));
      await assertFails(record.update({ studentId: STUDENT_A2 }));
    }
  });

  it("allows the current trainer to delete orphaned records for cleanup", async () => {
    await seed(async (db) => {
      const orphan = "deleted-student";
      await db.doc("workouts/orphan").set(withStudent(records.workout, orphan));
      await db.doc("biometrics/orphan").set(withStudent(records.biometric, orphan));
      await db.doc("schedules/orphan").set(withStudent(records.schedule, orphan));
      await db.doc(`billingPlans/${orphan}`).set(withStudent(records.billingPlan, orphan));
      await db.doc(`payments/${orphan}_2026-09`).set(withStudent(records.payment, orphan));
    });
    const db = as(TRAINER_A);
    await assertSucceeds(db.doc("workouts/orphan").delete());
    await assertSucceeds(db.doc("biometrics/orphan").delete());
    await assertSucceeds(db.doc("schedules/orphan").delete());
    await assertSucceeds(db.doc("billingPlans/deleted-student").delete());
    await assertSucceeds(db.doc("payments/deleted-student_2026-09").delete());
  });

  it("still lets a student create their own biometrics when the trainer granted it", async () => {
    await seed((db) => db.doc(`users/${STUDENT_A}`).update({ canLogBiometrics: true }));
    await assertSucceeds(as(STUDENT_A).doc("biometrics/self-log").set({
      trainerId: TRAINER_A, studentId: STUDENT_A, weight: 70, date: 1,
    }));
  });
});

describe("users: a student editing their own document", () => {
  it("may edit profile fields", async () => {
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ phone: "11999990000" }));
  });

  it.each([
    ["role", { role: "TRAINER" }],
    ["trainerId", { trainerId: TRAINER_B }],
    ["canSelfAssess", { canSelfAssess: true }],
    ["canLogBiometrics", { canLogBiometrics: true }],
    // The web-only permission to add extra sets when logging a session: trainer-granted, so a student
    // must not be able to switch it on for themselves.
    ["canAddSets", { canAddSets: true }],
    ["pendingAssessmentRequest (raising it)", { pendingAssessmentRequest: true }],
    ["inviteCode", { inviteCode: "OTHER" }],
    ["createdAt", { createdAt: 1 }],
  ])("may not change %s", async (_label, change) => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update(change));
  });
});

describe("GOALS.md §23 pause state", () => {
  it("lets only the owning trainer pause and reactivate a linked student with a boolean", async () => {
    const trainer = as(TRAINER_A);
    const linked = trainer.doc(`users/${STUDENT_A}`);
    await assertSucceeds(linked.update({ paused: true }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ paused: false }));
    await assertSucceeds(linked.update({ paused: false }));
    await assertFails(as(TRAINER_B).doc(`users/${STUDENT_A}`).update({ paused: true }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ paused: true }));
    await assertFails(linked.update({ paused: "true" }));
  });

  it("lets only the owning trainer pause and reactivate a draft with a boolean", async () => {
    await seed((db) => db.doc("students/draft-a").set({ trainerId: TRAINER_A, name: "Rita" }));
    const owner = as(TRAINER_A).doc("students/draft-a");
    await assertSucceeds(owner.update({ paused: true }));
    await assertSucceeds(owner.update({ paused: false }));
    await assertFails(as(TRAINER_B).doc("students/draft-a").update({ paused: true }));
    await assertFails(owner.update({ paused: "true" }));
  });

  it("keeps a paused student's profile, assigned content, and log access available", async () => {
    await seed(async (db) => {
      await db.doc(`users/${STUDENT_A}`).update({ paused: true });
      await db.doc("workouts/after-pause").set({
        trainerId: TRAINER_A, studentId: STUDENT_A, status: "assigned", name: "Treino",
      });
      await db.doc("biometrics/after-pause").set({ trainerId: TRAINER_A, studentId: STUDENT_A, weight: 70 });
    });
    const student = as(STUDENT_A);
    await assertSucceeds(student.doc(`users/${STUDENT_A}`).get());
    await assertSucceeds(student.doc("workouts/after-pause").get());
    await assertSucceeds(student.doc("biometrics/after-pause").get());
    await assertSucceeds(student.doc("workoutLogs/after-pause").set({
      trainerId: TRAINER_A, studentId: STUDENT_A, workoutId: "after-pause", exerciseName: "Supino",
      date: 1, performedSetsJson: "[]", note: null,
    }));
  });
});

describe("account settings self fields", () => {
  it("allows ADM, trainer, and student to update their own phone and fixed private avatar path", async () => {
    await assertSucceeds(as("adminA").doc("users/adminA").update({ phone: "+5511999999999" }));
    await assertSucceeds(as(TRAINER_A).doc(`users/${TRAINER_A}`).update({ phone: "+5511999999999" }));
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ phone: "+5511999999999" }));
    await assertFails(as(TRAINER_B).doc(`users/${TRAINER_A}`).update({ phone: "+5511888888888" }));
    await assertSucceeds(as("adminA").doc("users/adminA").update({ avatarStoragePath: "account-avatars/adminA/profile" }));
    await assertSucceeds(as(TRAINER_A).doc(`users/${TRAINER_A}`).update({ avatarStoragePath: null }));
  });

  it("synchronizes only the verified Auth e-mail and rejects mismatches", async () => {
    await assertSucceeds(asEmail(TRAINER_A, "trainer@exemplo.com").doc(`users/${TRAINER_A}`).update({ email: "trainer@exemplo.com" }));
    await seed((db) => db.doc(`users/${TRAINER_A}`).update({ email: "old@exemplo.com" }));
    await assertFails(asEmail(TRAINER_A, "trainer@exemplo.com", false).doc(`users/${TRAINER_A}`).update({ email: "trainer@exemplo.com" }));
    await assertFails(asEmail(TRAINER_A, "trainer@exemplo.com").doc(`users/${TRAINER_A}`).update({ email: "other@exemplo.com" }));
  });

  it("rejects privilege changes, unknown profile fields, and avatar paths owned by another UID", async () => {
    const self = as(TRAINER_A).doc(`users/${TRAINER_A}`);
    await assertFails(self.update({ role: "ADM" }));
    await assertFails(self.update({ trainerId: TRAINER_B }));
    await assertFails(self.update({ platformBillingStatus: "current", platformBillingUntil: null }));
    await assertFails(self.update({ avatarStoragePath: `account-avatars/${TRAINER_B}/profile` }));
    await assertFails(self.update({ unapprovedProfileField: true }));
  });
});

describe("invite privacy and ADM resolution", () => {
  it("lets a trainer list their own invites but prevents ADM from downloading invite profile data", async () => {
    await assertSucceeds(as(TRAINER_A).collection("invites").where("trainerId", "==", TRAINER_A).get());
    await assertFails(as("adminA").collection("invites").where("trainerId", "==", TRAINER_A).get());
  });

  it("lets ADM cancel a known unused code with a paired audit entry", async () => {
    await seed((db) => db.doc("invites/A1B2C3D4").set({ trainerId: TRAINER_A, used: false, createdAt: 1 }));
    const admin = as("adminA");
    const batch = admin.batch();
    batch.update(admin.doc("invites/A1B2C3D4"), { cancelledAt: 2 });
    batch.set(admin.doc("adminAudit/A1B2C3D4"), {
      at: 2, adminUid: "adminA", action: "invite.resolve", targetUid: TRAINER_A,
      note: "Código informado pelo personal", inviteId: "A1B2C3D4",
    });
    await assertSucceeds(batch.commit());
  });
});

// Rules version 4: an invite carries the student's name, phone and medical notes, so once it is
// spent (used, cancelled, revoked or expired) only its trainer, an ADM and the account that claimed
// it may read it. A live invite stays readable by any signed-in user because the claim reads it
// before the account exists.
describe("reading an invite (rules v4)", () => {
  const STRANGER = "strangerStudent";
  const CLAIMANT = "claimantStudent";
  const profile = { name: "Aluno", phone: "11999990000", medicalNotes: "joelho" };

  async function invite(code: string, extra: Record<string, unknown>) {
    await seed((db) => db.doc(`invites/${code}`).set({ trainerId: TRAINER_A, used: false, createdAt: 1, ...profile, ...extra }));
  }

  it("lets any signed-in user read a live invite, which is how the claim finds it", async () => {
    await invite("LIVE0001", {});
    await assertSucceeds(as(STRANGER).doc("invites/LIVE0001").get());
    await invite("LIVE0002", { expiresAt: Date.now() + 3_600_000 });
    await assertSucceeds(as(STRANGER).doc("invites/LIVE0002").get());
  });

  it("answers a mistyped code as missing instead of denying it", async () => {
    await assertSucceeds(as(STRANGER).doc("invites/NOPE0000").get());
  });

  it("refuses an anonymous reader even for a live invite", async () => {
    await invite("LIVE0003", {});
    await assertFails(env.unauthenticatedContext().firestore().doc("invites/LIVE0003").get());
  });

  it.each([
    ["used", { used: true }],
    ["cancelled", { cancelledAt: 5 }],
    ["revoked", { revokedAt: 5 }],
    ["expired", { expiresAt: 1 }],
  ])("hides a %s invite from a stranger", async (_label, extra) => {
    await invite("SPENT001", extra);
    await assertFails(as(STRANGER).doc("invites/SPENT001").get());
    await assertFails(as(TRAINER_B).doc("invites/SPENT001").get());
  });

  it.each([
    ["used", { used: true }],
    ["cancelled", { cancelledAt: 5 }],
  ])("still shows a %s invite to its trainer and to an ADM", async (_label, extra) => {
    await invite("SPENT002", extra);
    await assertSucceeds(as(TRAINER_A).doc("invites/SPENT002").get());
    await assertSucceeds(as("adminA").doc("invites/SPENT002").get());
  });

  it("shows a used invite to the account that claimed it, and only to that account", async () => {
    await invite("SPENT003", { used: true });
    await seed((db) => db.doc(`users/${CLAIMANT}`).set({ role: "STUDENT", trainerId: TRAINER_A, inviteCode: "SPENT003" }));
    await assertSucceeds(as(CLAIMANT).doc("invites/SPENT003").get());
    await seed((db) => db.doc(`users/${STRANGER}`).set({ role: "STUDENT", trainerId: TRAINER_A, inviteCode: "OTHERCODE" }));
    await assertFails(as(STRANGER).doc("invites/SPENT003").get());
  });

  it("does not let a spent invite be reached through a stranger's own claim attempt", async () => {
    await invite("SPENT004", { used: true });
    const stranger = as(STRANGER);
    await assertFails(stranger.runTransaction(async (transaction) => { await transaction.get(stranger.doc("invites/SPENT004")); }));
  });
});

// Rules version 5: a user may correct their own name once every 60 days. The change must carry nameChangedAt equal to the
// request's own time (the server's clock — a device clock decides nothing), and the previous stamp must be missing or at
// least 60 days old. The owning trainer's edit of a student's name is another rule and is unaffected.
describe("own name, once every 60 days (rules v5)", () => {
  const DAY = 86_400_000;
  const stamp = () => firebase.firestore.FieldValue.serverTimestamp();
  const at = (ms: number) => firebase.firestore.Timestamp.fromMillis(ms);
  const roles: Array<[string, string]> = [["an ADM", "adminA"], ["a trainer", TRAINER_A], ["a student", STUDENT_A]];

  it.each(roles)("%s can rename themselves the first time", async (_label, uid) => {
    await assertSucceeds(as(uid).doc(`users/${uid}`).update({ name: "Nome Corrigido", nameChangedAt: stamp() }));
  });

  it("refuses a rename without the stamp, which would be the way around the wait", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Sem Carimbo" }));
  });

  it("refuses a stamp taken from the device's clock instead of the server's", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Relogio Errado", nameChangedAt: at(Date.now()) }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Relogio Errado", nameChangedAt: at(Date.now() - 100 * DAY) }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Relogio Errado", nameChangedAt: Date.now() }));
  });

  it("does not let the stamp move without a rename", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ nameChangedAt: stamp() }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Aluno", nameChangedAt: stamp() }));
  });

  it("blocks a second rename inside 60 days, and allows it after", async () => {
    await seed((db) => db.doc(`users/${STUDENT_A}`).update({ name: "Primeiro Nome", nameChangedAt: at(Date.now() - 59 * DAY) }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Segundo Nome", nameChangedAt: stamp() }));
    await seed((db) => db.doc(`users/${STUDENT_A}`).update({ nameChangedAt: at(Date.now() - 61 * DAY) }));
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Segundo Nome", nameChangedAt: stamp() }));
    // ...and that rename restarts the wait
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Terceiro Nome", nameChangedAt: stamp() }));
  });

  it.each([
    ["empty", ""],
    ["one character", "A"],
    ["81 characters", "x".repeat(81)],
    ["padded with spaces", " Com Espacos "],
    ["a control character", "Ana\u0007Costa"],
    ["a newline", "Ana\nCosta"],
    ["not a string", 12345],
  ])("refuses a name that is %s", async (_label, name) => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name, nameChangedAt: stamp() }));
  });

  it("accepts the limits of a valid name", async () => {
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Al", nameChangedAt: stamp() }));
    await assertSucceeds(as(TRAINER_A).doc(`users/${TRAINER_A}`).update({ name: "x".repeat(80), nameChangedAt: stamp() }));
  });

  it("lets no one rename someone else through this path", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A2}`).update({ name: "Outra Pessoa", nameChangedAt: stamp() }));
    await assertFails(as(TRAINER_B).doc(`users/${STUDENT_A}`).update({ name: "Intruso", nameChangedAt: stamp() }));
  });

  it("does not let a rename carry another change with it", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Com Role", nameChangedAt: stamp(), role: "ADM" }));
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Com Trainer", nameChangedAt: stamp(), trainerId: TRAINER_B }));
  });

  it("leaves the other self edits, and the trainer's correction of a student's name, as they were", async () => {
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ phone: "+5511987654321" }));
    await assertSucceeds(as(TRAINER_A).doc(`users/${STUDENT_A}`).update({ name: "Corrigido Pelo Personal" }));
    // that correction neither needs nor resets the student's own 60-day clock
    await assertSucceeds(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ name: "Eu Mesmo", nameChangedAt: stamp() }));
  });
});

describe("billing lock and ADM recovery", () => {
  it("blocks trainer-owned actions when billing is blocked", async () => {
    await seed((db) => db.doc(`users/${TRAINER_A}`).update({ platformBillingStatus: "blocked", platformBillingUntil: 1 }));
    const trainer = as(TRAINER_A);
    await assertFails(trainer.doc("students/recovery-draft").set({ trainerId: TRAINER_A, role: "student" }));
    await assertSucceeds(trainer.doc(`users/${TRAINER_A}`).update({ phone: "11999990000" }));
  });

  it("requires a real trainer with active platform billing for ADM recovery drafts", async () => {
    const now = Date.now();
    await seed(async (db) => {
      await db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null }, { merge: true });
      await db.doc("platformSubscriptions/trainerA").set(platformSubscription(TRAINER_A));
      await db.doc("users/trainerNoSubscription").set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null });
      await db.doc("users/trainerSuspended").set({ role: "TRAINER", accessStatus: "suspended", suspendedAt: now, platformBillingStatus: "current", platformBillingUntil: null });
      await db.doc("platformSubscriptions/trainerSuspended").set(platformSubscription("trainerSuspended"));
      await db.doc("users/notATrainer").set({ role: "STUDENT", platformBillingStatus: "current", platformBillingUntil: null });
      await db.doc("platformSubscriptions/notATrainer").set(platformSubscription("notATrainer"));
      await db.doc("users/trainerBlocked").set({ role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: now - 1 });
      await db.doc("platformSubscriptions/trainerBlocked").set(platformSubscription("trainerBlocked"));
      await db.doc("users/trainerPending").set({ role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null });
      await db.doc("platformSubscriptions/trainerPending").set(platformSubscription("trainerPending"));
      await db.doc("users/trainerOverdue").set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: now - 1 });
      await db.doc("platformSubscriptions/trainerOverdue").set(platformSubscription("trainerOverdue"));
      await db.doc("users/trainerExpiredTrial").set({ role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: now - 1 });
      await db.doc("platformSubscriptions/trainerExpiredTrial").set(platformSubscription("trainerExpiredTrial", "trial", now - 1));
      await db.doc("users/trainerActiveTrial").set({ role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: now + 60_000 });
      await db.doc("platformSubscriptions/trainerActiveTrial").set(platformSubscription("trainerActiveTrial", "trial", now + 60_000));
    });

    const admin = as("adminA");
    async function createRecoveryDraft(trainerUid: string, studentId: string) {
      const batch = admin.batch();
      batch.set(admin.doc(`students/${studentId}`), {
        trainerId: trainerUid, name: "Rascunho", role: "student", gender: "", phone: "", goal: "",
        experienceLevel: "", medicalNotes: "", trainingDays: [], createdAt: now,
      });
      batch.set(admin.doc(`adminAudit/${studentId}`), {
        at: now, adminUid: "adminA", action: "admin.student.create", targetUid: trainerUid,
        note: "Recuperação", studentId,
      });
      await batch.commit();
    }

    const linkedSeatCount = async (trainerUid: string) => (await admin.collection("users")
      .where("role", "==", "STUDENT").where("trainerId", "==", trainerUid).get()).size;
    const seatsBefore = await linkedSeatCount(TRAINER_A);
    await createRecoveryDraft(TRAINER_A, "recovery-paid");
    await createRecoveryDraft("trainerActiveTrial", "recovery-trial");
    expect(await linkedSeatCount(TRAINER_A)).toBe(seatsBefore);
    expect(await linkedSeatCount("trainerActiveTrial")).toBe(0);
    expect((await admin.doc("adminAudit/recovery-paid").get()).data()).toMatchObject({
      adminUid: "adminA", action: "admin.student.create", targetUid: TRAINER_A, studentId: "recovery-paid",
    });

    for (const [trainerUid, studentId] of [
      ["trainerNoSubscription", "recovery-no-subscription"],
      ["trainerSuspended", "recovery-suspended"],
      ["notATrainer", "recovery-wrong-role"],
      ["trainerBlocked", "recovery-blocked"],
      ["trainerPending", "recovery-pending"],
      ["trainerOverdue", "recovery-overdue"],
      ["trainerExpiredTrial", "recovery-expired-trial"],
    ]) {
      const batch = admin.batch();
      batch.set(admin.doc(`students/${studentId}`), {
        trainerId: trainerUid, name: "Rascunho", role: "student", gender: "", phone: "", goal: "",
        experienceLevel: "", medicalNotes: "", trainingDays: [], createdAt: now,
      });
      batch.set(admin.doc(`adminAudit/${studentId}`), {
        at: now, adminUid: "adminA", action: "admin.student.create", targetUid: trainerUid,
        note: "Recuperação", studentId,
      });
      await assertFails(batch.commit());
    }
  });

  it("keeps pricing and invoice collections read-only to trainers", async () => {
    await assertFails(as(TRAINER_A).doc("platformPlanTemplates/basic").set({ name: "Plano" }));
    await assertFails(as(TRAINER_A).doc(`platformSubscriptions/${TRAINER_A}`).set({ trainerUid: TRAINER_A, mode: "paid" }));
    await assertFails(as(TRAINER_A).doc("platformInvoices/fake").set({ trainerUid: TRAINER_A, status: "paid" }));
  });

  it("allows only ADM to write defaults, denies direct invoice creation, and validates invoice updates", async () => {
    const admin = as("adminA");
    await seed(async (db) => {
      await db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null }, { merge: true });
      await db.doc(`platformSubscriptions/${TRAINER_A}`).set(platformSubscription(TRAINER_A));
    });
    const templateRef = admin.doc("platformPlanTemplates/basic");
    const template = {
      name: "Básico", monthlyBaseCents: 10000, includedStudentSeats: 10, extraStudentMonthlyCents: 500,
      maxActiveInviteCodes: 5, trialMaxStudentSeats: 2, trialDurationDays: 14, version: 1,
    };
    await assertFails(templateRef.set(template));
    const planCreate = admin.batch();
    planCreate.set(templateRef, { ...template, lastAuditId: "plan-create" });
    planCreate.set(admin.doc("adminAudit/plan-create"), {
      at: 1, adminUid: "adminA", action: "platform.plan.create", targetUid: "basic", note: "Criar plano",
      templateId: "basic", templateVersion: 1,
    });
    await assertSucceeds(planCreate.commit());
    const planUpdate = admin.batch();
    planUpdate.update(templateRef, { monthlyBaseCents: 11000, version: 2, lastAuditId: "plan-update" });
    planUpdate.set(admin.doc("adminAudit/plan-update"), {
      at: 2, adminUid: "adminA", action: "platform.plan.update", targetUid: "basic", note: "Atualizar plano",
      templateId: "basic", templateVersion: 2,
    });
    await assertSucceeds(planUpdate.commit());
    await assertFails(as(TRAINER_A).doc("platformPlanTemplates/trainer-plan").set({
      name: "Falso", monthlyBaseCents: 0, includedStudentSeats: 0, extraStudentMonthlyCents: 0,
      maxActiveInviteCodes: 0, trialMaxStudentSeats: 0, trialDurationDays: 0, version: 1,
    }));
    const defaultsRef = admin.doc("platformBillingConfig/trialDefaults");
    const defaults = {
      trialMaxStudentSeats: 2, trialDurationDays: 14, defaultPlanTemplateId: "basic", version: 1,
    };
    await assertFails(defaultsRef.set(defaults));
    const defaultsCreate = admin.batch();
    defaultsCreate.set(defaultsRef, { ...defaults, lastAuditId: "defaults-create" });
    defaultsCreate.set(admin.doc("adminAudit/defaults-create"), {
      at: 1, adminUid: "adminA", action: "platform.defaults.update", targetUid: "platformBillingConfig/trialDefaults",
      note: "Criar padrões", defaultsVersion: 1, defaultPlanTemplateId: "basic",
    });
    await assertSucceeds(defaultsCreate.commit());
    const defaultsUpdate = admin.batch();
    defaultsUpdate.update(defaultsRef, { trialDurationDays: 21, version: 2, lastAuditId: "defaults-update" });
    defaultsUpdate.set(admin.doc("adminAudit/defaults-update"), {
      at: 2, adminUid: "adminA", action: "platform.defaults.update", targetUid: "platformBillingConfig/trialDefaults",
      note: "Atualizar padrões", defaultsVersion: 2, defaultPlanTemplateId: "basic",
    });
    await assertSucceeds(defaultsUpdate.commit());
    await seed(async (db) => {
      await db.doc("adminAudit/replayed-plan-create").set({
        at: 3, adminUid: "adminA", action: "platform.plan.create", targetUid: "replayed-plan",
        note: "Evento já utilizado", templateId: "replayed-plan", templateVersion: 1,
      });
      await db.doc("adminAudit/replayed-plan-update").set({
        at: 3, adminUid: "adminA", action: "platform.plan.update", targetUid: "basic",
        note: "Evento já utilizado", templateId: "basic", templateVersion: 3,
      });
      await db.doc("adminAudit/replayed-defaults-update").set({
        at: 3, adminUid: "adminA", action: "platform.defaults.update", targetUid: "platformBillingConfig/trialDefaults",
        note: "Evento já utilizado", defaultsVersion: 3, defaultPlanTemplateId: "basic",
      });
    });
    const replayCreate = admin.batch();
    replayCreate.set(admin.doc("platformPlanTemplates/replayed-plan"), { ...template, lastAuditId: "replayed-plan-create" });
    await assertFails(replayCreate.commit());
    const replayUpdate = admin.batch();
    replayUpdate.update(templateRef, { monthlyBaseCents: 12000, version: 3, lastAuditId: "replayed-plan-update" });
    await assertFails(replayUpdate.commit());
    const replayDefaults = admin.batch();
    replayDefaults.update(defaultsRef, { version: 3, lastAuditId: "replayed-defaults-update" });
    await assertFails(replayDefaults.commit());
    const invoice = {
      id: `${TRAINER_A}_2026-10`, trainerUid: TRAINER_A, period: "2026-10", dueDate: "2026-10-31",
      linkedStudentSeats: 3, reservedInviteSeats: 2, billableStudentSeats: 5,
      includedStudentSeats: 2, extraStudentSeats: 3, monthlyBaseCents: 10000,
      extraStudentMonthlyCents: 500, extraAmountCents: 1500, amountCents: 11500, status: "unpaid",
      paidAt: null, paidBy: null, paymentReference: null, createdAt: 1, createdBy: "adminA",
      subscriptionVersion: 1, templateId: "basic", templateVersion: 1,
    };
    await assertFails(admin.doc(`platformInvoices/${invoice.id}`).set(invoice));
    await assertFails(admin.doc("platformInvoices/wrong-id").set(invoice));
    await seed((db) => db.doc(`platformInvoices/${invoice.id}`).set(invoice));
    const invoiceReference = admin.doc(`platformInvoices/${invoice.id}`);
    await assertFails(invoiceReference.update({ dueDate: "2026-11-30", lastAuditId: "missing-audit" }));

    const dueDate = "2026-11-30";
    const dueUntil = new Date(`${dueDate}T23:59:59.999-03:00`).getTime();
    await seed((db) => db.doc("adminAudit/replayed-invoice-event").set({
      at: 2, adminUid: "adminA", action: "invoice.extend", targetUid: TRAINER_A,
      note: "Evento já utilizado", invoiceId: invoice.id, days: 30,
      fromDueDate: invoice.dueDate, toDueDate: dueDate,
      billingFromStatus: "current", billingFromUntil: null,
      billingToStatus: "current", billingToUntil: dueUntil,
    }));
    const invoiceReplay = admin.batch();
    invoiceReplay.update(invoiceReference, { dueDate, lastAuditId: "replayed-invoice-event" });
    invoiceReplay.update(admin.doc(`users/${TRAINER_A}`), {
      platformBillingStatus: "current", platformBillingUntil: dueUntil, lastAuditId: "replayed-invoice-event",
    });
    await assertFails(invoiceReplay.commit());

    const mismatched = admin.batch();
    mismatched.update(invoiceReference, { dueDate, lastAuditId: "audit-mismatch" });
    mismatched.update(admin.doc(`users/${TRAINER_A}`), {
      platformBillingStatus: "current", platformBillingUntil: dueUntil, lastAuditId: "audit-mismatch",
    });
    mismatched.set(admin.doc("adminAudit/audit-mismatch"), {
      at: 2, adminUid: "adminA", action: "invoice.payment", targetUid: TRAINER_A,
      note: "Evento divergente", invoiceId: invoice.id, amountCents: invoice.amountCents, paymentReference: null,
      billingFromStatus: "current", billingFromUntil: null,
      billingToStatus: "current", billingToUntil: dueUntil,
    });
    await assertFails(mismatched.commit());

    await assertFails(admin.doc("adminAudit/orphan-extend").set({
      at: 2, adminUid: "adminA", action: "invoice.extend", targetUid: TRAINER_A,
      note: "Evento sem alvo", invoiceId: invoice.id, days: 30,
      fromDueDate: invoice.dueDate, toDueDate: dueDate,
      billingFromStatus: "current", billingFromUntil: null,
      billingToStatus: "current", billingToUntil: dueUntil,
    }));

    const extension = admin.batch();
    extension.update(invoiceReference, { dueDate, lastAuditId: "audit-extend" });
    extension.update(admin.doc(`users/${TRAINER_A}`), {
      platformBillingStatus: "current", platformBillingUntil: dueUntil, lastAuditId: "audit-extend",
    });
    extension.set(admin.doc("adminAudit/audit-extend"), {
      at: 2, adminUid: "adminA", action: "invoice.extend", targetUid: TRAINER_A,
      note: "Prorrogação sintética", invoiceId: invoice.id, days: 30,
      fromDueDate: invoice.dueDate, toDueDate: dueDate,
      billingFromStatus: "current", billingFromUntil: null,
      billingToStatus: "current", billingToUntil: dueUntil,
    });
    await assertSucceeds(extension.commit());

    await assertFails(invoiceReference.update({ status: "paid", paidAt: 3, paidBy: "adminA", lastAuditId: "missing-payment-audit" }));
    const payment = admin.batch();
    payment.update(invoiceReference, { status: "paid", paidAt: 3, paidBy: "adminA", paymentReference: "pix-sintetico", lastAuditId: "audit-payment" });
    payment.update(admin.doc(`users/${TRAINER_A}`), {
      platformBillingStatus: "current", platformBillingUntil: null, lastAuditId: "audit-payment",
    });
    payment.set(admin.doc("adminAudit/audit-payment"), {
      at: 3, adminUid: "adminA", action: "invoice.payment", targetUid: TRAINER_A,
      note: "Pagamento sintético", invoiceId: invoice.id, amountCents: invoice.amountCents, paymentReference: "pix-sintetico",
      billingFromStatus: "current", billingFromUntil: dueUntil,
      billingToStatus: "current", billingToUntil: null,
    });
    await assertSucceeds(payment.commit());
    await assertFails(invoiceReference.update({ reservedInviteSeats: 1, billableStudentSeats: 4 }));

    await seed((db) => db.doc("platformInvoices/missing-seats").set({
      ...without(without(invoice, "reservedInviteSeats"), "billableStudentSeats"), id: "missing-seats",
    }));
    await assertFails(admin.doc("platformInvoices/missing-seats").update({ status: "paid", paidAt: 2, paidBy: "adminA" }));
    await assertFails(admin.doc("platformInvoices/missing-seats").update({
      status: "paid", paidAt: 2, paidBy: "adminA", reservedInviteSeats: 1, billableStudentSeats: 4,
    }));
    const legacyPayment = admin.batch();
    legacyPayment.update(admin.doc("platformInvoices/missing-seats"), {
      status: "paid", paidAt: 2, paidBy: "adminA", paymentReference: null,
      reservedInviteSeats: 0, billableStudentSeats: 3, lastAuditId: "audit-legacy-payment",
    });
    legacyPayment.update(admin.doc(`users/${TRAINER_A}`), {
      platformBillingStatus: "current", platformBillingUntil: null, lastAuditId: "audit-legacy-payment",
    });
    legacyPayment.set(admin.doc("adminAudit/audit-legacy-payment"), {
      at: 2, adminUid: "adminA", action: "invoice.payment", targetUid: TRAINER_A,
      note: "Pagamento sintético legado", invoiceId: "missing-seats", amountCents: invoice.amountCents,
      paymentReference: null, billingFromStatus: "current", billingFromUntil: null,
      billingToStatus: "current", billingToUntil: null,
    });
    await assertSucceeds(legacyPayment.commit());

    const legacy = { ...without(without(invoice, "reservedInviteSeats"), "billableStudentSeats"), id: "legacy_2026-10" };
    await seed((db) => db.doc(`platformInvoices/${legacy.id}`).set(legacy));
    const legacyReference = admin.doc(`platformInvoices/${legacy.id}`);
    await assertSucceeds(legacyReference.get());
    await assertFails(legacyReference.update({ dueDate: "2026-11-30", reservedInviteSeats: 0, billableStudentSeats: 3, lastAuditId: "missing-legacy-audit" }));
  });
});

describe("billing audit linkage", () => {
  it("requires a matching audit for billing summary writes and rejects orphan events", async () => {
    await seed((db) => db.doc("users/promotionTarget").set({ role: "STUDENT" }));
    const admin = as("adminA");
    const target = admin.doc("users/promotionTarget");
    await assertFails(target.update({ role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null, lastAuditId: "missing-promote" }));
    await assertFails(admin.doc("adminAudit/orphan-promote").set({
      at: 3, adminUid: "adminA", action: "trainer.promote", targetUid: "promotionTarget", note: "Sem usuário",
      billingFromStatus: null, billingFromUntil: null, billingToStatus: "pending", billingToUntil: null,
    }));

    const mismatched = admin.batch();
    mismatched.set(target, { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null, lastAuditId: "promotion-mismatch" }, { merge: true });
    mismatched.set(admin.doc("adminAudit/promotion-mismatch"), {
      at: 4, adminUid: "adminA", action: "trainer.promote", targetUid: TRAINER_A, note: "UID divergente",
      billingFromStatus: null, billingFromUntil: null, billingToStatus: "pending", billingToUntil: null,
    });
    await assertFails(mismatched.commit());

    const matched = admin.batch();
    matched.set(target, { role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null, lastAuditId: "promotion-match" }, { merge: true });
    matched.set(admin.doc("adminAudit/promotion-match"), {
      at: 5, adminUid: "adminA", action: "trainer.promote", targetUid: "promotionTarget", note: "Aprovação sintética",
      billingFromStatus: null, billingFromUntil: null, billingToStatus: "pending", billingToUntil: null,
    });
    await assertSucceeds(matched.commit());
  });

  it("rejects a billing transition that reuses an existing user audit ID", async () => {
    await seed(async (db) => {
      await db.doc("users/promotionReplayTarget").set({ role: "STUDENT" });
      await db.doc("adminAudit/existing-promotion").set({
        at: 5, adminUid: "adminA", action: "trainer.promote", targetUid: "promotionReplayTarget", note: "Já usado",
        billingFromStatus: null, billingFromUntil: null, billingToStatus: "pending", billingToUntil: null,
      });
    });
    const admin = as("adminA");
    const replay = admin.batch();
    replay.set(admin.doc("users/promotionReplayTarget"), {
      role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: null, lastAuditId: "existing-promotion",
    }, { merge: true });
    await assertFails(replay.commit());
  });

  it("requires subscription assignment and trial extension to share their audit ID with the user", async () => {
    const now = Date.now();
    const trialEndsAt = now + 86_400_000;
    const currentTrialSubscription = platformSubscription(TRAINER_B, "trial", trialEndsAt);
    const admin = as("adminA");
    await seed(async (db) => {
      await db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: null }, { merge: true });
      await db.doc(`platformSubscriptions/${TRAINER_A}`).set(platformSubscription(TRAINER_A));
      await db.doc(`users/${TRAINER_B}`).set({ role: "TRAINER", platformBillingStatus: "trial", platformBillingUntil: trialEndsAt }, { merge: true });
      await db.doc(`platformSubscriptions/${TRAINER_B}`).set(currentTrialSubscription);
    });

    const subscriptionRef = admin.doc(`platformSubscriptions/${TRAINER_A}`);
    const userRef = admin.doc(`users/${TRAINER_A}`);
    const assigned = {
      ...platformSubscription(TRAINER_A),
      terms: { ...platformSubscription(TRAINER_A).terms, snapshotVersion: 2 },
      lastAuditId: "assign-match",
    };
    const replayedAssignment = { ...assigned, lastAuditId: "existing-assignment" };
    await seed((db) => db.doc("adminAudit/existing-assignment").set({
      at: now, adminUid: "adminA", action: "subscription.assign", targetUid: TRAINER_A,
      note: "Evento já utilizado", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "paid", overrideKeys: [], effectiveAt: replayedAssignment.effectiveAt,
      billingFromStatus: "current", billingFromUntil: null, billingToStatus: "current", billingToUntil: null,
    }));
    const subscriptionReplay = admin.batch();
    subscriptionReplay.set(subscriptionRef, replayedAssignment);
    subscriptionReplay.update(userRef, { lastAuditId: "existing-assignment" });
    await assertFails(subscriptionReplay.commit());

    await assertFails(subscriptionRef.set({ ...assigned, lastAuditId: "assign-without-audit" }));
    await assertFails(admin.doc("adminAudit/orphan-assign").set({
      at: now, adminUid: "adminA", action: "subscription.assign", targetUid: TRAINER_A,
      note: "Sem assinatura", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "paid", overrideKeys: [], effectiveAt: assigned.effectiveAt,
      billingFromStatus: "current", billingFromUntil: null, billingToStatus: "current", billingToUntil: null,
    }));

    const assignBatch = admin.batch();
    assignBatch.set(subscriptionRef, assigned);
    assignBatch.update(userRef, { lastAuditId: "assign-match" });
    assignBatch.set(admin.doc("adminAudit/assign-match"), {
      at: now, adminUid: "adminA", action: "subscription.assign", targetUid: TRAINER_A,
      note: "Plano atribuído", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "paid", overrideKeys: [], effectiveAt: assigned.effectiveAt,
      billingFromStatus: "current", billingFromUntil: null, billingToStatus: "current", billingToUntil: null,
    });
    await assertSucceeds(assignBatch.commit());

    const nextTrialEndsAt = trialEndsAt + 86_400_000;
    const trialSubscriptionRef = admin.doc(`platformSubscriptions/${TRAINER_B}`);
    const trialUserRef = admin.doc(`users/${TRAINER_B}`);
    const extended = { ...currentTrialSubscription, trialEndsAt: nextTrialEndsAt, updatedAt: now + 1, lastAuditId: "trial-match" };
    const trialBatch = admin.batch();
    trialBatch.set(trialSubscriptionRef, extended);
    trialBatch.update(trialUserRef, { platformBillingStatus: "trial", platformBillingUntil: nextTrialEndsAt, lastAuditId: "trial-match" });
    trialBatch.set(admin.doc("adminAudit/trial-match"), {
      at: now, adminUid: "adminA", action: "trial.extend", targetUid: TRAINER_B,
      note: "Prorrogação sintética", days: 1, fromTrialEndsAt: trialEndsAt, toTrialEndsAt: nextTrialEndsAt,
      billingFromStatus: "trial", billingFromUntil: trialEndsAt,
      billingToStatus: "trial", billingToUntil: nextTrialEndsAt,
    });
    await assertSucceeds(trialBatch.commit());
  });

  it("does not let a paid or trial assignment bypass an unpaid invoice", async () => {
    const admin = as("adminA");
    const now = Date.now();
    const trainerUid = "unpaidAssignmentTrainer";
    const invoiceId = "unpaid-assignment-invoice";
    const expiredAt = now - 1_000;
    const originalSubscription = {
      ...platformSubscription(trainerUid, "trial", expiredAt),
      currentInvoiceId: invoiceId,
    };
    const invoice = {
      id: invoiceId, trainerUid, period: "2026-09", dueDate: "2026-09-01",
      linkedStudentSeats: 0, reservedInviteSeats: 0, billableStudentSeats: 0,
      includedStudentSeats: 5, extraStudentSeats: 0, monthlyBaseCents: 10000,
      extraStudentMonthlyCents: 500, extraAmountCents: 0, amountCents: 10000, status: "unpaid",
      paidAt: null, paidBy: null, paymentReference: null, createdAt: 1, createdBy: "adminA",
      subscriptionVersion: 1, templateId: "basic", templateVersion: 1,
    };
    await seed(async (db) => {
      await db.doc(`users/${trainerUid}`).set({
        role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: expiredAt,
      });
      await db.doc(`platformSubscriptions/${trainerUid}`).set(originalSubscription);
      await db.doc(`platformInvoices/${invoiceId}`).set(invoice);
    });

    const subscriptionRef = admin.doc(`platformSubscriptions/${trainerUid}`);
    const userRef = admin.doc(`users/${trainerUid}`);
    const paidAssignmentId = "unpaid-assignment-paid";
    const paidAssignment = admin.batch();
    paidAssignment.set(subscriptionRef, {
      ...originalSubscription, mode: "paid", trialStartedAt: null, trialEndsAt: null,
      terms: { ...originalSubscription.terms, snapshotVersion: 2 }, updatedAt: now, lastAuditId: paidAssignmentId,
    });
    paidAssignment.update(userRef, {
      platformBillingStatus: "current", platformBillingUntil: null, lastAuditId: paidAssignmentId,
    });
    paidAssignment.set(admin.doc(`adminAudit/${paidAssignmentId}`), {
      at: now, adminUid: "adminA", action: "subscription.assign", targetUid: trainerUid,
      note: "Atribuição não pode ignorar fatura", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "paid", overrideKeys: [], effectiveAt: now,
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "current", billingToUntil: null,
    });
    await assertFails(paidAssignment.commit());

    const trialEndsAt = now + 86_400_000;
    const trialAssignmentId = "unpaid-assignment-trial";
    const trialAssignment = admin.batch();
    trialAssignment.set(subscriptionRef, {
      ...originalSubscription, mode: "trial", trialStartedAt: now, trialEndsAt,
      terms: { ...originalSubscription.terms, snapshotVersion: 2 }, updatedAt: now, lastAuditId: trialAssignmentId,
    });
    trialAssignment.update(userRef, {
      platformBillingStatus: "trial", platformBillingUntil: trialEndsAt, lastAuditId: trialAssignmentId,
    });
    trialAssignment.set(admin.doc(`adminAudit/${trialAssignmentId}`), {
      at: now, adminUid: "adminA", action: "subscription.assign", targetUid: trainerUid,
      note: "Atribuição de teste não pode ignorar fatura", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "trial", overrideKeys: [], effectiveAt: now,
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "trial", billingToUntil: trialEndsAt,
    });
    await assertFails(trialAssignment.commit());

    await seed((db) => db.doc(`platformInvoices/${invoiceId}`).update({ status: "paid" }));
    const paidInvoiceAssignmentId = "paid-invoice-assignment";
    const paidInvoiceAssignment = admin.batch();
    paidInvoiceAssignment.set(subscriptionRef, {
      ...originalSubscription, mode: "paid", trialStartedAt: null, trialEndsAt: null,
      terms: { ...originalSubscription.terms, snapshotVersion: 2 }, updatedAt: now + 1,
      lastAuditId: paidInvoiceAssignmentId,
    });
    paidInvoiceAssignment.update(userRef, {
      platformBillingStatus: "current", platformBillingUntil: null, lastAuditId: paidInvoiceAssignmentId,
    });
    paidInvoiceAssignment.set(admin.doc(`adminAudit/${paidInvoiceAssignmentId}`), {
      at: now + 1, adminUid: "adminA", action: "subscription.assign", targetUid: trainerUid,
      note: "Atribuição após pagamento confirmado", subscriptionVersion: 2, templateId: "basic", templateVersion: 1,
      mode: "paid", overrideKeys: [], effectiveAt: now,
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "current", billingToUntil: null,
    });
    await assertSucceeds(paidInvoiceAssignment.commit());
  });

  it("requires invoice and trial extensions to preserve already-expired account blocks", async () => {
    const admin = as("adminA");
    const now = Date.now();
    const expiredAt = now - 1_000;
    const nextTrialEndsAt = now + 86_400_000;
    const invoiceId = "blocked-invoice";
    const invoice = {
      id: invoiceId, trainerUid: "blockedTrainer", period: "2026-09", dueDate: "2026-09-01",
      linkedStudentSeats: 0, reservedInviteSeats: 0, billableStudentSeats: 0,
      includedStudentSeats: 5, extraStudentSeats: 0, monthlyBaseCents: 10000,
      extraStudentMonthlyCents: 500, extraAmountCents: 0, amountCents: 10000, status: "unpaid",
      paidAt: null, paidBy: null, paymentReference: null, createdAt: 1, createdBy: "adminA",
      subscriptionVersion: 1, templateId: "basic", templateVersion: 1,
    };
    await seed(async (db) => {
      await db.doc("users/blockedTrainer").set({
        role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: expiredAt,
      });
      await db.doc("platformSubscriptions/blockedTrainer").set({
        trainerUid: "blockedTrainer", mode: "trial",
        terms: { snapshotVersion: 1, templateId: "basic", templateVersion: 1 },
        overrides: {}, chargeDuringTrial: true, effectiveAt: expiredAt - 86_400_000,
        trialStartedAt: expiredAt - 2 * 86_400_000, trialEndsAt: expiredAt,
        currentInvoiceId: invoiceId, updatedAt: now,
      });
      await db.doc(`platformInvoices/${invoiceId}`).set(invoice);
    });

    const invoiceRef = admin.doc(`platformInvoices/${invoiceId}`);
    const userRef = admin.doc("users/blockedTrainer");
    const invoiceUnlock = admin.batch();
    invoiceUnlock.update(invoiceRef, { dueDate: "2026-11-01", lastAuditId: "invoice-extension-unlock" });
    invoiceUnlock.update(userRef, {
      platformBillingStatus: "current", platformBillingUntil: now + 86_400_000, lastAuditId: "invoice-extension-unlock",
    });
    invoiceUnlock.set(admin.doc("adminAudit/invoice-extension-unlock"), {
      at: now, adminUid: "adminA", action: "invoice.extend", targetUid: "blockedTrainer",
      note: "Não pode desbloquear", invoiceId, days: 61,
      fromDueDate: invoice.dueDate, toDueDate: "2026-11-01",
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "current", billingToUntil: now + 86_400_000,
    });
    await assertFails(invoiceUnlock.commit());

    const invoiceKeepBlocked = admin.batch();
    invoiceKeepBlocked.update(invoiceRef, { dueDate: "2026-11-01", lastAuditId: "invoice-extension-blocked" });
    invoiceKeepBlocked.update(userRef, {
      platformBillingStatus: "blocked", platformBillingUntil: expiredAt, lastAuditId: "invoice-extension-blocked",
    });
    invoiceKeepBlocked.set(admin.doc("adminAudit/invoice-extension-blocked"), {
      at: now, adminUid: "adminA", action: "invoice.extend", targetUid: "blockedTrainer",
      note: "Mantém bloqueio", invoiceId, days: 61,
      fromDueDate: invoice.dueDate, toDueDate: "2026-11-01",
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "blocked", billingToUntil: expiredAt,
    });
    await assertSucceeds(invoiceKeepBlocked.commit());

    const subscriptionRef = admin.doc("platformSubscriptions/blockedTrainer");
    const trialUnlock = admin.batch();
    trialUnlock.update(subscriptionRef, { trialEndsAt: nextTrialEndsAt, updatedAt: now + 1, lastAuditId: "trial-extension-unlock" });
    trialUnlock.update(userRef, {
      platformBillingStatus: "trial", platformBillingUntil: nextTrialEndsAt, lastAuditId: "trial-extension-unlock",
    });
    trialUnlock.set(admin.doc("adminAudit/trial-extension-unlock"), {
      at: now, adminUid: "adminA", action: "trial.extend", targetUid: "blockedTrainer",
      note: "Não pode desbloquear", days: 1, fromTrialEndsAt: expiredAt, toTrialEndsAt: nextTrialEndsAt,
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "trial", billingToUntil: nextTrialEndsAt,
    });
    await assertFails(trialUnlock.commit());

    const trialKeepBlocked = admin.batch();
    trialKeepBlocked.update(subscriptionRef, { trialEndsAt: nextTrialEndsAt, updatedAt: now + 2, lastAuditId: "trial-extension-blocked" });
    trialKeepBlocked.update(userRef, {
      platformBillingStatus: "blocked", platformBillingUntil: expiredAt, lastAuditId: "trial-extension-blocked",
    });
    trialKeepBlocked.set(admin.doc("adminAudit/trial-extension-blocked"), {
      at: now, adminUid: "adminA", action: "trial.extend", targetUid: "blockedTrainer",
      note: "Mantém bloqueio", days: 1, fromTrialEndsAt: expiredAt, toTrialEndsAt: nextTrialEndsAt,
      billingFromStatus: "blocked", billingFromUntil: expiredAt,
      billingToStatus: "blocked", billingToUntil: expiredAt,
    });
    await assertSucceeds(trialKeepBlocked.commit());
  });
});

describe("users: clearing a pending assessment request", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await db.doc(`users/${STUDENT_A}`).update({ pendingAssessmentRequest: true, canSelfAssess: true });
      await db.doc("assessments/old").set({ studentId: STUDENT_A, trainerId: TRAINER_A, submittedAt: 1 });
    });
  });

  it("works in the same batch that creates the new assessment — how the Android app does it", async () => {
    const db = as(STUDENT_A);
    const batch = db.batch();
    batch.set(db.doc("assessments/new1"), { studentId: STUDENT_A, trainerId: TRAINER_A, submittedAt: 2 });
    batch.update(db.doc(`users/${STUDENT_A}`), { pendingAssessmentRequest: false, lastAssessmentId: "new1" });
    await assertSucceeds(batch.commit());
  });

  it("can't be done by pointing at an older assessment", async () => {
    await assertFails(
      as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ pendingAssessmentRequest: false, lastAssessmentId: "old" }),
    );
  });

  it("can't be done without an assessment at all", async () => {
    await assertFails(as(STUDENT_A).doc(`users/${STUDENT_A}`).update({ pendingAssessmentRequest: false }));
  });
});

describe("claiming an invite", () => {
  const NEW_STUDENT = "newStudent";

  function claimDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      role: "STUDENT",
      trainerId: TRAINER_A,
      inviteCode: OPEN_INVITE,
      name: "Novo",
      phone: "",
      gender: "Masculino",
      goal: "",
      experienceLevel: "",
      medicalNotes: "",
      trainingDays: [],
      createdAt: 1_700_000_000_000,
      ...overrides,
    };
  }

  async function claim(uid: string, data: Record<string, unknown>, db: Db = as(uid)) {
    // The same shape as AuthRepository.claimInvite: one transaction that reads the invite, writes
    // the account, and marks the invite used.
    return db.runTransaction(async (transaction) => {
      await transaction.get(db.doc(`invites/${OPEN_INVITE}`));
      transaction.set(db.doc(`users/${uid}`), data);
      transaction.update(db.doc(`invites/${OPEN_INVITE}`), { used: true });
    });
  }

  it("accepts a legacy invite with no expiry when the account and invite are written together", async () => {
    await assertSucceeds(claim(NEW_STUDENT, claimDoc()));
  });

  it("blocks a paused draft for first claim and re-claim, then allows it after reactivation", async () => {
    await seed((db) => db.doc("students/draft1").set({ trainerId: TRAINER_A, name: "Novo", paused: true }));
    await assertFails(claim(NEW_STUDENT, claimDoc()));
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc()));
    await seed((db) => db.doc("students/draft1").update({ paused: false }));
    await assertSucceeds(claim("orphan", claimDoc()));
  });

  it("treats a legacy draft without paused as active", async () => {
    await seed((db) => db.doc("students/draft1").set({ trainerId: TRAINER_A, name: "Novo" }));
    await assertSucceeds(claim(NEW_STUDENT, claimDoc()));
  });

  it("accepts a new invite with null expiry and null cancellation or revocation fields", async () => {
    await seed((db) => db.doc(`invites/${OPEN_INVITE}`).update({ expiresAt: null, cancelledAt: null, revokedAt: null }));
    await assertSucceeds(claim(NEW_STUDENT, claimDoc()));
  });

  it("accepts an invite with a future numeric expiry", async () => {
    await seed((db) => db.doc(`invites/${OPEN_INVITE}`).update({ expiresAt: Date.now() + 60_000 }));
    await assertSucceeds(claim(NEW_STUDENT, claimDoc()));
  });

  it("is single-use: writing the account without marking the invite is rejected", async () => {
    await assertFails(as(NEW_STUDENT).doc(`users/${NEW_STUDENT}`).set(claimDoc()));
  });

  it("can't burn an invite without claiming it", async () => {
    await assertFails(as("bystander").doc(`invites/${OPEN_INVITE}`).update({ used: true }));
  });

  it("can't arrive with trainer-granted permissions already switched on", async () => {
    await assertFails(claim(NEW_STUDENT, claimDoc({ canSelfAssess: true, canLogBiometrics: true })));
    await assertFails(claim(NEW_STUDENT, claimDoc({ canAddSets: true })));
  });

  it("can't attach to a trainer other than the invite's", async () => {
    await assertFails(claim(NEW_STUDENT, claimDoc({ trainerId: TRAINER_B })));
  });

  it("can't reuse an invite that was already used", async () => {
    await seed((db) => db.doc(`invites/${OPEN_INVITE}`).update({ used: true }));
    await assertFails(claim(NEW_STUDENT, claimDoc()));
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc()));
  });

  async function rejectFirstClaimAndReclaim(inviteFields: Record<string, unknown>) {
    await seed((db) => db.doc(`invites/${OPEN_INVITE}`).update(inviteFields));
    await assertFails(claim(NEW_STUDENT, claimDoc()));
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc()));
  }

  it("rejects a cancelled invite for first claim and re-claim", async () => {
    await rejectFirstClaimAndReclaim({ cancelledAt: Date.now() });
  });

  it("rejects a revoked invite for first claim and re-claim", async () => {
    await rejectFirstClaimAndReclaim({ revokedAt: Date.now() });
  });

  it("rejects an expired legacy invite for first claim and re-claim", async () => {
    await rejectFirstClaimAndReclaim({ expiresAt: 1 });
  });

  it("fails closed for a malformed expiry on first claim and re-claim", async () => {
    await rejectFirstClaimAndReclaim({ expiresAt: "not-a-timestamp" });
  });

  it("the re-claim path (an unclaimed STUDENT doc already exists) has the same guarantees", async () => {
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc({ canSelfAssess: true })));
    await assertSucceeds(claim("orphan", claimDoc()));
  });

  it("cannot use a valid invite to attach another user's unclaimed profile", async () => {
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    const db = as(NEW_STUDENT);
    const batch = db.batch();
    batch.set(db.doc(`users/${NEW_STUDENT}`), claimDoc());
    batch.update(db.doc("users/orphan"), claimDoc());
    batch.update(db.doc(`invites/${OPEN_INVITE}`), { used: true });
    await assertFails(batch.commit());
  });

  // GOALS.md §27: Firebase only checks an address's shape. Without a confirmed one (the link mailed
  // to it was opened), an invented or mistyped address must never become a student.
  it("needs a confirmed e-mail", async () => {
    await assertFails(claim(NEW_STUDENT, claimDoc(), asUnverified(NEW_STUDENT)));
    await assertFails(claim(NEW_STUDENT, claimDoc(), asWithoutClaim(NEW_STUDENT)));
    // Refused as a whole: the invite is still open for the same person once they confirm.
    await assertSucceeds(claim(NEW_STUDENT, claimDoc()));
  });

  it("needs a confirmed e-mail on the re-claim path too", async () => {
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc(), asUnverified("orphan")));
    await assertSucceeds(claim("orphan", claimDoc()));
  });
});

describe("trainerRequests", () => {
  it("are queued only from a confirmed e-mail (GOALS.md §27)", async () => {
    const request = { email: "novo@exemplo.com", createdAt: 1 };
    await assertFails(asUnverified("candidate").doc("trainerRequests/candidate").set(request));
    await assertFails(asWithoutClaim("candidate").doc("trainerRequests/candidate").set(request));
    await assertSucceeds(as("candidate").doc("trainerRequests/candidate").set(request));
  });

  it("are only ever one's own", async () => {
    await assertFails(as("candidate").doc("trainerRequests/someoneElse").set({ email: "x@y.com", createdAt: 1 }));
  });
});

// GOALS.md §27: the confirmed e-mail is an entry door, not a new condition on everything. A student who
// already has a profile — every one created before §27, none of whom was ever asked to confirm — keeps
// doing all they did. If one of these fails, the rule went somewhere it must not.
describe("verified e-mail: accounts that already exist are not affected", () => {
  beforeEach(async () => {
    await seed((db) => db.doc(`users/${STUDENT_A}`).update({ canSelfAssess: true, canLogBiometrics: true }));
  });

  it("an unconfirmed linked student reads, edits and logs as before", async () => {
    const db = asUnverified(STUDENT_A);
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).get());
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ phone: "11999990000" }));
    await assertSucceeds(
      db.doc("workoutLogs/l1").set({ trainerId: TRAINER_A, studentId: STUDENT_A, workoutId: "w1", date: 1, performedSetsJson: "[]" }),
    );
    await assertSucceeds(db.doc("assessments/a1").set({ trainerId: TRAINER_A, studentId: STUDENT_A, submittedAt: 1 }));
    await assertSucceeds(db.doc("biometrics/b1").set({ trainerId: TRAINER_A, studentId: STUDENT_A, date: 1, weight: 70 }));
  });

  it("an unconfirmed trainer works as before", async () => {
    const db = asUnverified(TRAINER_A);
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).get());
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ canAddSets: true }));
    await assertSucceeds(db.doc("invites/NEWCODE1").set({ trainerId: TRAINER_A, used: false, createdAt: 1 }));
  });

  it("an unconfirmed account still can't edit what it never could", async () => {
    await assertFails(asUnverified(STUDENT_A).doc(`users/${STUDENT_A}`).update({ role: "TRAINER" }));
    await assertFails(asUnverified("stranger").doc(`users/${STUDENT_A}`).get());
  });
});

// GOALS.md §34: `ficha` is a web-only map on a treino (the ficha it belongs to). The rules validate no workout
// fields, so it needs no rules change — this proves it, and that who may touch it did not move.
describe("workouts carrying a ficha map (GOALS.md §34)", () => {
  const member = {
    trainerId: TRAINER_A,
    studentId: STUDENT_A,
    name: "Treino A",
    isActive: true,
    exercisesJson: "[]",
    createdAt: 1,
    status: "assigned",
    assignedAt: 1,
    ficha: { id: "f1", name: "Hipertrofia", createdAt: 1, updatedAt: 1, order: 0 },
  };

  it("the owning trainer creates, updates and deletes one", async () => {
    const db = as(TRAINER_A);
    await assertSucceeds(db.doc("workouts/h1").set(member));
    await assertSucceeds(db.doc("workouts/h1").update({ ficha: { ...member.ficha, name: "Nova", updatedAt: 5 } }));
    await assertSucceeds(db.doc("workouts/h1").delete());
  });

  it("the linked student reads it; another trainer can't write or delete it", async () => {
    await seed((db) => db.doc("workouts/h1").set(member));
    await assertSucceeds(as(STUDENT_A).doc("workouts/h1").get());
    await assertFails(as(TRAINER_B).doc("workouts/h1").delete());
    await assertFails(as(TRAINER_B).doc("workouts/h1").update({ ficha: null }));
    await assertFails(as(STUDENT_A).doc("workouts/h1").update({ ficha: null }));
  });
});

describe("workoutLogs", () => {
  function log(studentId: string): Record<string, unknown> {
    return {
      trainerId: TRAINER_A,
      studentId,
      workoutId: "w1",
      exerciseName: "Supino",
      date: 1_700_000_000_000,
      performedSetsJson: "[]",
      note: null,
    };
  }

  it("a student logs and edits their own sessions", async () => {
    const db = as(STUDENT_A);
    await assertSucceeds(db.doc("workoutLogs/l1").set(log(STUDENT_A)));
    await assertSucceeds(db.doc("workoutLogs/l1").update({ note: "pesado" }));
  });

  it("a student can't take over another student's log", async () => {
    await seed((db) => db.doc("workoutLogs/l1").set(log(STUDENT_A)));
    await assertFails(as(STUDENT_A2).doc("workoutLogs/l1").set(log(STUDENT_A2)));
  });

  it("the trainer reads their own students' logs, another trainer doesn't", async () => {
    await seed((db) => db.doc("workoutLogs/l1").set(log(STUDENT_A)));
    await assertSucceeds(as(TRAINER_A).collection("workoutLogs").where("trainerId", "==", TRAINER_A).get());
    await assertFails(as(TRAINER_B).collection("workoutLogs").where("trainerId", "==", TRAINER_A).get());
  });
});

describe("existing rules the web relies on, unchanged by §23d", () => {
  beforeEach(async () => {
    await seed(async (db) => {
      await db.doc("workouts/assigned").set({ trainerId: TRAINER_A, studentId: STUDENT_A, status: "assigned", name: "Ficha A" });
      await db.doc("workouts/draft").set({ trainerId: TRAINER_A, studentId: STUDENT_A, status: "draft", name: "Ficha B" });
      await db.doc("workouts/other").set({ trainerId: TRAINER_A, studentId: STUDENT_A2, status: "assigned", name: "Ficha C" });
    });
  });

  it("/aluno: a student reads their own profile and their own assigned fichas only", async () => {
    const db = as(STUDENT_A);
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).get());
    await assertFails(db.doc(`users/${STUDENT_A2}`).get());
    await assertSucceeds(db.doc("workouts/assigned").get());
    await assertFails(db.doc("workouts/draft").get());
    await assertFails(db.doc("workouts/other").get());
    await assertSucceeds(
      db.collection("workouts").where("studentId", "==", STUDENT_A).where("status", "==", "assigned").get(),
    );
  });

  it("/app: a trainer reads, edits and grants permissions on their own linked students only", async () => {
    const db = as(TRAINER_A);
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).get());
    await assertSucceeds(db.collection("users").where("trainerId", "==", TRAINER_A).where("role", "==", "STUDENT").get());
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ phone: "1133334444" }));
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ canSelfAssess: true, pendingAssessmentRequest: true }));
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ canAddSets: true }));
    await assertSucceeds(db.doc(`users/${STUDENT_A}`).update({ canAddSets: false }));
    await assertFails(as(TRAINER_B).doc(`users/${STUDENT_A}`).update({ canAddSets: true }));
    await assertFails(db.doc(`users/${STUDENT_A}`).update({ trainerId: TRAINER_B }));
    await assertFails(as(TRAINER_B).doc(`users/${STUDENT_A}`).get());
  });
});

describe("GOALS.md §26d — suspended trainers, summaries and audit", () => {
  const stats = {
    trainerId: TRAINER_A, updatedAt: 1, lastSeenAt: 1,
    students: { total: 1, linked: 1, pending: 0 }, sessions7d: 0, adherence28d: null,
    quiet: 0, pendingAssessments: 0,
    billing: { month: "2026-10", activePlans: 0, planCents: 0, expectedCents: 0, receivedCents: 0, overdueCents: 0 },
  };
  const activity = {
    trainerId: TRAINER_A, month: "2026-10", updatedAt: 1, actions: { login: 1 }, activeDays: ["2026-10-01"],
  };

  it("denies suspended trainers across trainer-owned collections but leaves their users doc readable", async () => {
    await seed(async (db) => {
      await db.doc(`users/${TRAINER_A}`).update({ accessStatus: "suspended" });
      await db.doc("students/d1").set({ trainerId: TRAINER_A, name: "Ana" });
      await db.doc("workouts/w1").set({ trainerId: TRAINER_A, studentId: STUDENT_A, status: "assigned" });
      await db.doc("schedules/s1").set({ trainerId: TRAINER_A, studentId: STUDENT_A });
      await db.doc("biometrics/b1").set({ trainerId: TRAINER_A, studentId: STUDENT_A });
      await db.doc("payments/p1").set({ trainerId: TRAINER_A, studentId: STUDENT_A });
      await db.doc("billingPlans/p1").set({ ...stats.billing, trainerId: TRAINER_A, studentId: STUDENT_A });
      await db.doc("trainerStats/trainerA").set(stats);
      await db.doc("trainerActivity/trainerA_2026-10").set(activity);
    });
    const db = as(TRAINER_A);
    await assertSucceeds(db.doc(`users/${TRAINER_A}`).get());
    for (const path of ["students/d1", "workouts/w1", "schedules/s1", "biometrics/b1", "payments/p1", "billingPlans/p1", "trainerStats/trainerA", "trainerActivity/trainerA_2026-10"]) {
      await assertFails(db.doc(path).get());
    }
    await assertFails(db.doc("students/new").set({ trainerId: TRAINER_A, name: "Nova" }));
    await assertFails(db.doc("invites/NEWCODE1").set({ trainerId: TRAINER_A, used: false }));
  });

  it("prevents self-reactivation and lets an ADM suspend and reactivate", async () => {
    await seed(async (db) => {
      await db.doc("users/admin").set({ role: "ADM" });
      await db.doc("users/legacyTrainer").set({ role: "TRAINER" });
    });
    await assertFails(as(TRAINER_A).doc(`users/${TRAINER_A}`).update({ accessStatus: "active" }));
    await assertFails(as("legacyTrainer").doc("users/legacyTrainer").update({ accessStatus: "active" }));
    await assertSucceeds(as("admin").doc(`users/${TRAINER_A}`).update({ accessStatus: "suspended", suspendedAt: 2, suspendedReason: "pausa" }));
    await assertSucceeds(as("admin").doc(`users/${TRAINER_A}`).update({ accessStatus: "active", suspendedAt: null, suspendedReason: null }));
  });

  it("keeps student access to assigned workouts and personal logs during trainer suspension", async () => {
    await seed(async (db) => {
      await db.doc(`users/${TRAINER_A}`).update({ accessStatus: "suspended" });
      await db.doc("workouts/assigned").set({ trainerId: TRAINER_A, studentId: STUDENT_A, status: "assigned" });
    });
    const student = as(STUDENT_A);
    await assertSucceeds(student.doc("workouts/assigned").get());
    await assertSucceeds(student.doc("workoutLogs/l1").set({
      trainerId: TRAINER_A, studentId: STUDENT_A, workoutId: "assigned", exerciseName: "Supino",
      date: 1, performedSetsJson: "[]", note: null,
    }));
  });

  it("allows only the owning active trainer to write valid stats and monotonic activity", async () => {
    await assertSucceeds(as(TRAINER_A).doc("trainerStats/trainerA").set(stats));
    await assertFails(as(TRAINER_A).doc("trainerStats/trainerA").update({ "billing.planCents": 1.5 }));
    const incompleteBilling = {
      month: stats.billing.month, activePlans: stats.billing.activePlans, planCents: stats.billing.planCents,
      expectedCents: stats.billing.expectedCents, overdueCents: stats.billing.overdueCents,
    };
    await assertFails(as(TRAINER_A).doc("trainerStats/trainerA").set({ ...stats, billing: incompleteBilling }));
    await assertFails(as(TRAINER_B).doc("trainerStats/trainerA").set(stats));
    await assertFails(as(TRAINER_B).doc("trainerStats/trainerA").get());
    await assertFails(as("admin").doc("trainerStats/trainerA").set(stats));

    const own = as(TRAINER_A);
    await assertSucceeds(own.doc("trainerActivity/trainerA_2026-10").set(activity));
    await assertSucceeds(own.doc("trainerActivity/trainerA_2026-10").update({ "actions.login": 2 }));
    await assertFails(own.doc("trainerActivity/trainerA_2026-10").update({ "actions.login": 1 }));
    await assertFails(own.doc("trainerActivity/trainerA_2026-10").update({ actions: {} }));
    await assertSucceeds(own.doc("trainerActivity/trainerA_2026-10").update({ actions: { login: 2, geminiGenerated: 1 } }));
    await assertFails(own.doc("trainerActivity/not-the-path").set(activity));
    await assertFails(as(TRAINER_B).doc("trainerActivity/trainerA_2026-10").set(activity));
    await assertFails(as("admin").doc("trainerActivity/trainerA_2026-10").set(activity));
  });

  it("accepts ADM audit creates only and keeps entries append-only", async () => {
    const entry = { at: 1, adminUid: "admin", action: "trainer.suspend", targetUid: TRAINER_A, note: "pausa" };
    await seed((db) => db.doc("users/admin").set({ role: "ADM" }));
    const admin = as("admin");
    await assertSucceeds(admin.doc("adminAudit/a1").set(entry));
    await assertFails(admin.doc("adminAudit/a1").update({ note: "alterado" }));
    await assertFails(admin.doc("adminAudit/a1").delete());
    await assertFails(as(TRAINER_A).doc("adminAudit/a2").set({ ...entry, adminUid: TRAINER_A }));
  });
});

// GOALS.md §33 — the trainer's exercise reference is one gated document, never a public file. Synthetic
// exercises only (§33f): what is tested is who may read and write the document, not what is in it.
describe("the exercise catalog document (rules v6)", () => {
  const PATH = "appData/exerciseCatalog";
  const catalog = (overrides: Record<string, unknown> = {}) => ({
    version: "abc123",
    exercises: [{ name: "Exercício A", group: "Grupo", muscles: { "Músculo X": 1 } }],
    updatedAt: 1_700_000_000_000,
    ...overrides,
  });

  beforeEach(async () => {
    await seed(async (db) => {
      await db.doc(PATH).set(catalog());
      await db.doc("users/trainerSuspended").set({ role: "TRAINER", accessStatus: "suspended", suspendedAt: 1 });
      await db.doc("users/trainerLocked").set({ role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: 1 });
      await db.doc("users/trainerOverdue").set({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: 1 });
    });
  });

  it("an active trainer and the ADM can read it", async () => {
    await assertSucceeds(as(TRAINER_A).doc(PATH).get());
    await assertSucceeds(as("adminA").doc(PATH).get());
  });

  it("nobody else can: anonymous, a student, a suspended or billing-locked trainer, a user with no profile", async () => {
    await assertFails(anonymous().doc(PATH).get());
    await assertFails(as(STUDENT_A).doc(PATH).get());
    await assertFails(as("trainerSuspended").doc(PATH).get());
    await assertFails(as("trainerLocked").doc(PATH).get());
    await assertFails(as("trainerOverdue").doc(PATH).get());
    await assertFails(as("nobodyWithoutProfile").doc(PATH).get());
  });

  it("the collection cannot be listed or queried, not even by the ADM", async () => {
    await assertFails(as(TRAINER_A).collection("appData").get());
    await assertFails(as("adminA").collection("appData").get());
    await assertFails(as(TRAINER_A).collection("appData").where("version", "==", "abc123").get());
  });

  it("no other document in the collection is readable or writable", async () => {
    await seed((db) => db.doc("appData/other").set(catalog()));
    await assertFails(as(TRAINER_A).doc("appData/other").get());
    await assertFails(as("adminA").doc("appData/other").get());
    await assertFails(as("adminA").doc("appData/another").set(catalog()));
  });

  it("only the ADM writes it — a trainer, a student and an anonymous caller cannot create, update or delete", async () => {
    for (const db of [as(TRAINER_A), as(STUDENT_A), anonymous()]) {
      await assertFails(db.doc(PATH).set(catalog({ version: "hijack" })));
      await assertFails(db.doc(PATH).update({ version: "hijack" }));
      await assertFails(db.doc(PATH).delete());
    }
    await seed((db) => db.doc(PATH).delete());
    await assertFails(as(TRAINER_A).doc(PATH).set(catalog()));
  });

  it("the ADM can publish a valid document, and cannot delete it", async () => {
    const admin = as("adminA");
    await assertSucceeds(admin.doc(PATH).set(catalog({ version: "def456", updatedAt: 1_700_000_000_001 })));
    await assertSucceeds(admin.doc(PATH).update({ version: "ghi789" }));
    await assertFails(admin.doc(PATH).delete());
  });

  const malformed: Array<[string, Record<string, unknown>]> = [
    ["an extra key", catalog({ extra: "x" })],
    ["an empty version", catalog({ version: "" })],
    ["a non-string version", catalog({ version: 7 })],
    ["an oversized version", catalog({ version: "v".repeat(65) })],
    ["exercises that is not a list", catalog({ exercises: {} })],
    ["an empty list", catalog({ exercises: [] })],
    ["301 exercises", catalog({ exercises: Array.from({ length: 301 }, () => ({ name: "x" })) })],
    ["a non-integer updatedAt", catalog({ updatedAt: "now" })],
    ["no updatedAt", { version: "abc123", exercises: catalog().exercises }],
  ];

  it.each(malformed)("the ADM cannot publish a malformed document: %s", async (_label, data) => {
    await assertFails(as("adminA").doc(PATH).set(data));
  });
});
