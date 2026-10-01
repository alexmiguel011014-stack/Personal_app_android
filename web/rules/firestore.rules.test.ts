import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

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

  it("works when the account is written and the invite marked used together", async () => {
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
  });

  it("the re-claim path (an unclaimed STUDENT doc already exists) has the same guarantees", async () => {
    await seed((db) => db.doc("users/orphan").set({ role: "STUDENT", trainerId: null }));
    await assertFails(claim("orphan", claimDoc({ canSelfAssess: true })));
    await assertSucceeds(claim("orphan", claimDoc()));
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
