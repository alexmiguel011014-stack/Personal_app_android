import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { claimInvite } from "../src/data/invites";
import {
  createDraftStudent,
  generateInvite,
  requestAssessment,
  setStudentPermissions,
  updateStudentProfile,
} from "../src/data/students";
import { emptyProfile } from "../src/domain/studentProfile";
import { loadMyProfile, resolveProfile } from "../src/data/session";
import { ensureMonthlyCharges, loadTrainerSnapshot, loadTrainerView } from "../src/data/trainerData";
import { deleteWorkout, loadMyWorkouts, loadStudentWorkouts, newWorkout, saveWorkout, saveWorkouts } from "../src/data/workouts";
import { addBiometric, loadMyBiometrics, loadStudentBiometrics, logOwnBiometric } from "../src/data/biometrics";
import { loadStudentAssessments, submitAssessment } from "../src/data/assessments";
import { loadMyLogs, logSession } from "../src/data/workoutLogs";
import { PAR_Q } from "../src/domain/assessments";
import { bookSlot, loadSchedules, removeBooking } from "../src/data/schedules";
import { adjustCharge, createPlan, markPaid, setPlanActive, undoPayment, updatePlan } from "../src/data/billing";

// GOALS.md §23e: the data layer against the Firestore emulator, through the real rules — the same
// modular SDK calls the app makes, signed in as a given uid. This is where the three layers meet:
// 23c's model, 23d's rules and 23e's converters all have to agree for these writes to land.

const PROJECT_ID = "demo-personal-tracker";
const ZONE = "America/Sao_Paulo";
const RULES_FILE = process.env.RULES_FILE ?? fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let env: RulesTestEnvironment;
const apps: FirebaseApp[] = [];

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(RULES_FILE, "utf8") } });
});

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

/** A modular Firestore client signed in as `uid` (emulator mock token) — what the app code gets. */
function signedInAs(uid: string): Firestore {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator" }, `test-${uid}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081").split(":");
  // A confirmed address, as every real account that reaches these screens has (GOALS.md §27: an invite
  // claim needs one; firestore.rules.test.ts covers the unconfirmed cases).
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, email_verified: true } });
  return db;
}

async function seed(documents: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries(documents).map(([path, data]) => db.doc(path).set(data)));
  });
}

function plan(studentId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    studentId,
    trainerId: "trainerA",
    amountCents: 15000,
    currency: "BRL",
    dueDay: 10,
    active: true,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("ensureMonthlyCharges", () => {
  it("creates a month's charges once, and re-running never wipes a recorded payment", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "billingPlans/studentA": plan("studentA"),
      "billingPlans/studentB": plan("studentB", { active: false }),
    });
    const db = signedInAs("trainerA");
    const { plans } = await loadTrainerSnapshot(db, "trainerA");
    expect(plans.map((p) => p.studentId).sort()).toEqual(["studentA", "studentB"]);

    // The rules accept exactly the document the converter writes (every field, no `id`).
    expect(await ensureMonthlyCharges(db, plans, "2026-09", 1_700_000_100_000)).toBe(1);

    const charge = doc(db, "payments", "studentA_2026-09");
    await updateDoc(charge, { paidAt: 1_700_000_200_000, method: "pix" });
    expect(await ensureMonthlyCharges(db, plans, "2026-09", 1_700_000_300_000)).toBe(0);
    expect((await getDoc(charge)).data()).toMatchObject({ paidAt: 1_700_000_200_000, method: "pix", dueDate: "2026-09-10" });
  });

  it("can't generate charges for another trainer's plans", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "billingPlans/studentA": plan("studentA"),
    });
    const stolenPlan = {
      studentId: "studentA",
      trainerId: "trainerA",
      amountCents: 15000,
      currency: "BRL" as const,
      dueDay: 10,
      active: true,
      createdAt: 1,
    };
    await expect(ensureMonthlyCharges(signedInAs("trainerB"), [stolenPlan], "2026-09", 1)).rejects.toThrow();
  });
});

describe("a trainer's writes to students (GOALS.md §23g)", () => {
  const profile = { ...emptyProfile(), name: "Ana Costa", trainingDays: ["Segunda", "Quarta"] };

  async function read(path: string): Promise<Record<string, unknown> | undefined> {
    let data: Record<string, unknown> | undefined;
    await env.withSecurityRulesDisabled(async (context) => {
      data = (await context.firestore().doc(path).get()).data();
    });
    return data;
  }

  it("creates a draft, invites it, and the invite claims into an account with the draft's profile", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    const db = signedInAs("trainerA");
    const id = await createDraftStudent(db, "trainerA", profile, 5);
    expect(await read(`students/${id}`)).toMatchObject({ trainerId: "trainerA", name: "Ana Costa", role: "student", createdAt: 5 });

    const snapshot = await loadTrainerSnapshot(db, "trainerA");
    const code = await generateInvite(db, "trainerA", snapshot.drafts[0], 6);
    expect(await read(`invites/${code}`)).toMatchObject({ trainerId: "trainerA", used: false, draftId: id, name: "Ana Costa" });

    // The web's own invite, claimed through the web's own claim: the whole loop without the phone.
    expect(await claimInvite(signedInAs("ana-uid"), "ana-uid", code, 7)).toEqual({ ok: true, trainerId: "trainerA" });
    const after = await loadTrainerSnapshot(db, "trainerA");
    expect(after.students.map((s) => [s.name, s.linked])).toEqual([["Ana Costa", true]]);
  });

  it("gets a fresh code when the first one is already taken", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "invites/TAKEN000": { trainerId: "trainerB", used: false, createdAt: 1 },
    });
    const db = signedInAs("trainerA");
    await createDraftStudent(db, "trainerA", profile, 5);
    const [draft] = (await loadTrainerSnapshot(db, "trainerA")).drafts;
    const codes = ["TAKEN000", "FRESH001"];
    expect(await generateInvite(db, "trainerA", draft, 6, () => codes.shift() ?? "FRESH002")).toBe("FRESH001");
    expect((await read("invites/TAKEN000"))?.trainerId).toBe("trainerB"); // untouched
  });

  it("edits a draft whole and a connected account by merge, grants permissions and requests an assessment", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/linked": {
        role: "STUDENT",
        trainerId: "trainerA",
        inviteCode: "X",
        name: "Bruno",
        createdAt: 1,
        canSelfAssess: false,
        canLogBiometrics: false,
        pendingAssessmentRequest: false,
      },
    });
    const db = signedInAs("trainerA");
    const draftId = await createDraftStudent(db, "trainerA", profile, 5);
    const { drafts, linked } = await loadTrainerSnapshot(db, "trainerA");

    await updateStudentProfile(db, "trainerA", { kind: "draft", doc: drafts[0] }, { ...profile, goal: "Força" });
    expect(await read(`students/${draftId}`)).toMatchObject({ goal: "Força", createdAt: 5 });

    await updateStudentProfile(db, "trainerA", { kind: "linked", doc: linked[0] }, { ...profile, name: "Bruno Alves" });
    expect(await read("users/linked")).toMatchObject({ name: "Bruno Alves", role: "STUDENT", inviteCode: "X", createdAt: 1 });

    await setStudentPermissions(db, "linked", true, true);
    await requestAssessment(db, "linked");
    expect(await read("users/linked")).toMatchObject({
      canSelfAssess: true,
      canLogBiometrics: true,
      pendingAssessmentRequest: true,
    });
  });
});

describe("loadTrainerView (GOALS.md §23g)", () => {
  it("shows this month's charge even when another load created it — two tabs at once", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "billingPlans/studentA": plan("studentA") });
    // Both read before either writes: one creates the charge, the other finds it already there.
    // Found in the browser — React's dev double-mount did exactly this — and the second one used
    // to show a snapshot without the charge.
    const [first, second] = await Promise.all([
      loadTrainerView(signedInAs("trainerA"), "trainerA", "2026-09", 1, ZONE),
      loadTrainerView(signedInAs("trainerA"), "trainerA", "2026-09", 2, ZONE),
    ]);
    expect(first.chargesCreated + second.chargesCreated).toBe(1);
    for (const view of [first, second]) {
      expect(view.snapshot.payments.map((p) => p.id)).toEqual(["studentA_2026-09"]);
    }
  });

  it("writes nothing when every active plan already has its charge", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "billingPlans/studentA": plan("studentA") });
    await loadTrainerView(signedInAs("trainerA"), "trainerA", "2026-09", 1, ZONE);
    const again = await loadTrainerView(signedInAs("trainerA"), "trainerA", "2026-09", 2, ZONE);
    expect(again.chargesCreated).toBe(0);
    expect(again.snapshot.payments).toHaveLength(1);
  });
});

describe("claimInvite and resolveProfile (GOALS.md §23f)", () => {
  const CODE = "AB12CD34";
  const invite = {
    trainerId: "trainerA",
    used: false,
    createdAt: 1,
    draftId: "draft1",
    name: "Maria",
    gender: "Feminino",
    trainingDays: ["Segunda"],
  };

  async function read(path: string): Promise<Record<string, unknown> | undefined> {
    let data: Record<string, unknown> | undefined;
    await env.withSecurityRulesDisabled(async (context) => {
      data = (await context.firestore().doc(path).get()).data();
    });
    return data;
  }

  it("creates the student's account from the invite and marks it used, in one transaction", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, [`invites/${CODE}`]: invite });
    const result = await claimInvite(signedInAs("newStudent"), "newStudent", CODE, 5);
    expect(result).toEqual({ ok: true, trainerId: "trainerA" });
    expect(await read("users/newStudent")).toMatchObject({
      role: "STUDENT",
      trainerId: "trainerA",
      inviteCode: CODE,
      name: "Maria",
      gender: "Feminino",
      phone: "",
      trainingDays: ["Segunda"],
      createdAt: 5,
    });
    expect((await read(`invites/${CODE}`))?.used).toBe(true);
    expect(await resolveProfile(signedInAs("newStudent"), "newStudent")).toEqual({ role: "STUDENT", trainerId: "trainerA" });
  });

  it.each([
    ["an unknown code", {}, "Código de convite inválido"],
    ["a used invite", { [`invites/${CODE}`]: { ...invite, used: true } }, "Código de convite já utilizado"],
  ])("refuses %s with the app's own message", async (_label, documents, message) => {
    await seed({ "users/trainerA": { role: "TRAINER" }, ...documents });
    expect(await claimInvite(signedInAs("newStudent"), "newStudent", CODE, 5)).toEqual({ ok: false, message });
  });

  it("explains, instead of showing Firebase's error, when the account already belongs to a trainer", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      [`invites/${CODE}`]: invite,
      "users/taken": { role: "STUDENT", trainerId: "trainerB", inviteCode: "OLD", name: "Maria", createdAt: 1 },
    });
    expect(await claimInvite(signedInAs("taken"), "taken", CODE, 5)).toEqual({
      ok: false,
      message: "Esta conta já está vinculada a um perfil existente — fale com o administrador.",
    });
    expect((await read(`invites/${CODE}`))?.used).toBe(false);
  });

  it("resolves a trainer, and an account with no document yet as an unclaimed student", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    expect(await resolveProfile(signedInAs("trainerA"), "trainerA")).toEqual({ role: "TRAINER", trainerId: null });
    // Reading one's own users/{uid} before it exists must be allowed, or a new account can't load.
    expect(await resolveProfile(signedInAs("brandNew"), "brandNew")).toEqual({ role: "STUDENT", trainerId: null });
  });
});

describe("loadTrainerSnapshot", () => {
  it("merges drafts and accounts, drops the draft a claim superseded, and skips malformed documents", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "students/draft-maria": { trainerId: "trainerA", name: "Maria", role: "student", createdAt: 1 },
      "students/draft-joao": { trainerId: "trainerA", name: "João", role: "student", createdAt: 1 },
      "students/broken": { trainerId: "trainerA", name: 42 },
      "students/someone-elses": { trainerId: "trainerB", name: "Outro" },
      "users/maria-uid": {
        role: "STUDENT",
        trainerId: "trainerA",
        inviteCode: "INV-MARIA",
        name: "Maria",
        createdAt: 2,
      },
      "invites/INV-MARIA": { trainerId: "trainerA", used: true, draftId: "draft-maria", createdAt: 1 },
      "workoutLogs/l1": {
        trainerId: "trainerA",
        studentId: "maria-uid",
        workoutId: "w1",
        exerciseName: "Supino",
        date: 3,
        performedSetsJson: "[]",
        note: null,
      },
    });
    const snapshot = await loadTrainerSnapshot(signedInAs("trainerA"), "trainerA");
    expect(snapshot.students.map((s) => [s.id, s.linked])).toEqual([
      ["draft-joao", false],
      ["maria-uid", true],
    ]);
    expect(snapshot.logs.map((l) => l.id)).toEqual(["l1"]);
  });
});

describe("fichas (GOALS.md §23g)", () => {
  const exercises = [
    { name: "Supino", sets: 3, reps: "12", weight: null, restSeconds: null, notes: null, muscleActivation: null },
  ];

  function stored(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      trainerId: "trainerA",
      studentId: "s1",
      name: "Ficha A",
      isActive: true,
      exercisesJson: "[]",
      createdAt: 1,
      status: "assigned",
      assignedAt: 1,
      ...overrides,
    };
  }

  it("saves a ficha the student sees while it's active, and stops seeing once it's deactivated", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
    });
    const trainer = signedInAs("trainerA");
    const saved = await saveWorkout(trainer, "trainerA", newWorkout("trainerA", "s1", "Ficha A", exercises, 100), 100);
    expect(saved).toMatchObject({ status: "assigned", assignedAt: 100 });

    // The phone's student query (StudentRepository), through the real rules.
    const student = signedInAs("s1");
    const visible = async () => {
      const found = await getDocs(
        query(collection(student, "workouts"), where("studentId", "==", "s1"), where("status", "==", "assigned")),
      );
      return found.docs.map((d) => d.id);
    };
    expect(await visible()).toEqual([saved.id]);

    await saveWorkout(trainer, "trainerA", { ...saved, isActive: false }, 200);
    expect(await visible()).toEqual([]);
    await assertFails(getDoc(doc(student, "workouts", saved.id)));
    expect(await loadStudentWorkouts(trainer, "trainerA", "s1")).toEqual([
      { ...saved, isActive: false, status: "draft", assignedAt: null },
    ]);
  });

  // GOALS.md §25e — the treinos of one pasted answer, saved together.
  it("saves several fichas in one batch: all visible to the student, listed newest first", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
    });
    const trainer = signedInAs("trainerA");
    // createdAt descending from A, so the trainer's newest-first list reads A, B, C.
    const batch = ["Treino A", "Treino B", "Treino C"].map((name, i) =>
      newWorkout("trainerA", "s1", name, exercises, 100 + (2 - i)),
    );
    const saved = await saveWorkouts(trainer, "trainerA", batch, 100);
    expect(saved.map((w) => w.status)).toEqual(["assigned", "assigned", "assigned"]);

    expect((await loadStudentWorkouts(trainer, "trainerA", "s1")).map((w) => w.name)).toEqual(["Treino A", "Treino B", "Treino C"]);
    const student = signedInAs("s1");
    expect((await loadMyWorkouts(student, "s1")).map((w) => w.name)).toEqual(["Treino A", "Treino B", "Treino C"]);
  });

  it("a batch with one forbidden ficha writes none of them", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
    });
    const trainerB = signedInAs("trainerB");
    // trainerB tries to write fichas under trainerA's id — the rules refuse it, and with it the batch.
    const batch = ["Treino A", "Treino B"].map((name) => newWorkout("trainerA", "s1", name, exercises, 100));
    await assertFails(saveWorkouts(trainerB, "trainerA", batch, 100));
    const trainerA = signedInAs("trainerA");
    expect(await loadStudentWorkouts(trainerA, "trainerA", "s1")).toEqual([]);
  });

  it("lists only this trainer's fichas for the student, newest first; deletes only their own", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "workouts/old": stored({ createdAt: 1 }),
      "workouts/new": stored({ createdAt: 2, isActive: false, status: "draft", assignedAt: null }),
      "workouts/other-student": stored({ studentId: "s2" }),
      "workouts/other-trainer": stored({ trainerId: "trainerB" }),
    });
    const trainer = signedInAs("trainerA");
    expect((await loadStudentWorkouts(trainer, "trainerA", "s1")).map((w) => w.id)).toEqual(["new", "old"]);

    await assertFails(deleteWorkout(trainer, "other-trainer"));
    await deleteWorkout(trainer, "old");
    expect((await loadStudentWorkouts(trainer, "trainerA", "s1")).map((w) => w.id)).toEqual(["new"]);
  });
});

describe("measurements and self-assessments (GOALS.md §23g)", () => {
  it("records a measurement the student's own query then sees, newest first for the trainer", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
      "biometrics/older": { trainerId: "trainerA", studentId: "s1", weight: 74.0, height: 1.65, bodyFat: 0, date: 1 },
    });
    const trainer = signedInAs("trainerA");
    const added = await addBiometric(trainer, "trainerA", "s1", { weight: 72, bodyFat: 18.5 }, 50);
    expect((await loadStudentBiometrics(trainer, "trainerA", "s1")).map((b) => [b.id, b.weight])).toEqual([
      [added.id, 72],
      ["older", 74],
    ]);

    // StudentRepository.getMyBiometrics, through the real rules.
    const student = signedInAs("s1");
    const own = await getDocs(query(collection(student, "biometrics"), where("studentId", "==", "s1")));
    expect(own.docs.map((d) => d.id).sort()).toEqual([added.id, "older"].sort());
  });

  it("lists a student's self-assessments to their trainer only, newest first", async () => {
    const submission = { studentId: "s1", trainerId: "trainerA", parQAnswersJson: '{"medication":true}' };
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "assessments/first": { ...submission, submittedAt: 1 },
      "assessments/second": { ...submission, submittedAt: 2 },
    });
    const assessments = await loadStudentAssessments(signedInAs("trainerA"), "trainerA", "s1");
    expect(assessments.map((a) => [a.id, a.parQAnswers])).toEqual([
      ["second", { medication: true }],
      ["first", { medication: true }],
    ]);
    expect(await loadStudentAssessments(signedInAs("trainerB"), "trainerB", "s1")).toEqual([]);
    await assertFails(getDocs(query(collection(signedInAs("trainerB"), "assessments"), where("studentId", "==", "s1"))));
  });
});

describe("the agenda (GOALS.md §23g)", () => {
  it("books and removes a slot; the booked student can read it, another trainer can't touch it", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
    });
    const trainer = signedInAs("trainerA");
    const booked = await bookSlot(trainer, "trainerA", "s1", "Segunda", "08h");
    expect(await loadSchedules(trainer, "trainerA")).toEqual([booked]);
    await assertSucceeds(getDoc(doc(signedInAs("s1"), "schedules", booked.id)));

    const other = signedInAs("trainerB");
    expect(await loadSchedules(other, "trainerB")).toEqual([]);
    await assertFails(removeBooking(other, booked.id));

    await removeBooking(trainer, booked.id);
    expect(await loadSchedules(trainer, "trainerA")).toEqual([]);
  });
});

describe("managing mensalidades (GOALS.md §23g)", () => {
  it("registers, edits and pauses a plan; a second registration can't overwrite it", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    const db = signedInAs("trainerA");
    await createPlan(db, "trainerA", "s1", 15000, 10, 1_000);
    await assertFails(createPlan(db, "trainerA", "s1", 9900, 5, 2_000));

    await updatePlan(db, "s1", 16000, 15);
    await setPlanActive(db, "s1", false);
    const { plans } = await loadTrainerSnapshot(db, "trainerA");
    expect(plans).toEqual([
      { studentId: "s1", trainerId: "trainerA", amountCents: 16000, currency: "BRL", dueDay: 15, active: false, createdAt: 1_000 },
    ]);
  });

  it("settles a charge, undoes it, adjusts it within its month — and nothing across months", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "users/trainerB": { role: "TRAINER" }, "billingPlans/s1": plan("s1") });
    const db = signedInAs("trainerA");
    const { plans } = await loadTrainerSnapshot(db, "trainerA");
    await ensureMonthlyCharges(db, plans, "2026-09", 1_700_000_100_000);
    const charge = doc(db, "payments", "s1_2026-09");

    await markPaid(db, "s1_2026-09", 1_700_000_200_000, "pix", "pago na recepção");
    expect((await getDoc(charge)).data()).toMatchObject({ paidAt: 1_700_000_200_000, method: "pix", note: "pago na recepção" });
    await undoPayment(db, "s1_2026-09");
    expect((await getDoc(charge)).data()).toMatchObject({ paidAt: null, method: null, note: "pago na recepção" });

    await adjustCharge(db, "s1_2026-09", 12000, "2026-09-20");
    expect((await getDoc(charge)).data()).toMatchObject({ amountCents: 12000, dueDate: "2026-09-20" });
    await assertFails(adjustCharge(db, "s1_2026-09", 12000, "2026-10-01"));
    await assertFails(markPaid(signedInAs("trainerB"), "s1_2026-09", 1, "cash", null));
  });
});

describe("the student's own area (GOALS.md §23h)", () => {
  function student(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      role: "STUDENT",
      trainerId: "trainerA",
      inviteCode: "X",
      name: "Ana Costa",
      createdAt: 1,
      canSelfAssess: false,
      canLogBiometrics: false,
      pendingAssessmentRequest: false,
      ...overrides,
    };
  }
  const ficha = {
    trainerId: "trainerA",
    studentId: "s1",
    isActive: true,
    exercisesJson: "[]",
    createdAt: 1,
    status: "assigned",
    assignedAt: 1,
  };

  it("reads their profile and their assigned fichas only, by name", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": student(),
      "workouts/b": { ...ficha, name: "Ficha B" },
      "workouts/a": { ...ficha, name: "Ficha A" },
      "workouts/draft": { ...ficha, name: "Rascunho", isActive: false, status: "draft", assignedAt: null },
    });
    const db = signedInAs("s1");
    expect(await loadMyProfile(db, "s1")).toMatchObject({ name: "Ana Costa", trainerId: "trainerA" });
    expect((await loadMyWorkouts(db, "s1")).map((w) => w.name)).toEqual(["Ficha A", "Ficha B"]);
  });

  it("logs a session — one document per exercise, for their own trainer — which the trainer sees", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "users/s1": student() });
    const db = signedInAs("s1");
    const entries: [string, { setNumber: number; weight: string; reps: number }[]][] = [
      ["Supino", [{ setNumber: 1, weight: "20", reps: 12 }]],
      ["Remada", [{ setNumber: 1, weight: "30", reps: 10 }]],
    ];
    await logSession(db, "s1", "trainerA", "w1", entries, 1_000);
    expect((await loadMyLogs(db, "s1")).map((l) => [l.exerciseName, l.date]).sort()).toEqual([
      ["Remada", 1_001],
      ["Supino", 1_000],
    ]);
    const { logs } = await loadTrainerSnapshot(signedInAs("trainerA"), "trainerA");
    expect(logs).toHaveLength(2);

    // Attributed to someone else's trainer: refused, and the batch writes nothing.
    await assertFails(logSession(db, "s1", "trainerB", "w1", entries, 2_000));
    expect(await loadMyLogs(db, "s1")).toHaveLength(2);
  });

  it("records their own measurement only while the trainer allows it", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "users/s1": student() });
    await assertFails(logOwnBiometric(signedInAs("s1"), "s1", "trainerA", { weight: 70, bodyFat: 0 }, 1));

    await seed({ "users/s1": student({ canLogBiometrics: true }) });
    await logOwnBiometric(signedInAs("s1"), "s1", "trainerA", { weight: 70.5, bodyFat: 18 }, 2);
    expect((await loadMyBiometrics(signedInAs("s1"), "s1")).map((b) => b.weight)).toEqual([70.5]);
  });

  it("answers a requested self-assessment: one assessment, and the request cleared with it", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": student({ canSelfAssess: true, pendingAssessmentRequest: true }),
    });
    const db = signedInAs("s1");
    const answers = { ...Object.fromEntries(PAR_Q.map((q) => [q.key, false])), bone_joint: true };
    const id = await submitAssessment(db, "s1", "trainerA", answers, { goal: "Hipertrofia", experienceLevel: "Interm.", trainingDays: ["Terça"] }, 5);

    expect(await loadMyProfile(db, "s1")).toMatchObject({ pendingAssessmentRequest: false });
    expect((await getDoc(doc(db, "users", "s1"))).get("lastAssessmentId")).toBe(id);
    const [sent] = await loadStudentAssessments(signedInAs("trainerA"), "trainerA", "s1");
    expect(sent).toMatchObject({ id, submittedAt: 5, goal: "Hipertrofia", experienceLevel: "Interm.", trainingDays: ["Terça"] });
    expect(sent.parQAnswers.bone_joint).toBe(true);
  });

  it("can't send one without self-assessment granted", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "users/s1": student({ pendingAssessmentRequest: true }) });
    await assertFails(
      submitAssessment(signedInAs("s1"), "s1", "trainerA", {}, { goal: "", experienceLevel: "", trainingDays: [] }, 5),
    );
  });
});
