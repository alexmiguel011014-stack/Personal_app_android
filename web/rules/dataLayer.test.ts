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
import {
  FichaNotFound,
  FichaTooLarge,
  createFicha,
  deleteFicha,
  loadMyWorkouts,
  loadStudentFichas,
  loadStudentWorkouts,
  saveFicha,
  type FichaDraft,
} from "../src/data/workouts";
import { addBiometric, loadMyBiometrics, loadStudentBiometrics, logOwnBiometric } from "../src/data/biometrics";
import { loadStudentAssessments, submitAssessment } from "../src/data/assessments";
import { loadMyLogs, logSession } from "../src/data/workoutLogs";
import { PAR_Q } from "../src/domain/assessments";
import { bookSlot, loadSchedules, removeBooking } from "../src/data/schedules";
import { adjustCharge, createPlan, markPaid, setPlanActive, undoPayment, updatePlan } from "../src/data/billing";
import { countLinkedStudents, loadTrainers, setAccessStatus } from "../src/data/admin";
import { loadActivity } from "../src/data/admin";
import { trackActivity, writeTrainerStats } from "../src/data/activity";
import { dashboardFigures } from "../src/domain/dashboard";

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
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
      "users/studentB": { role: "STUDENT", trainerId: "trainerA" },
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
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
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
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
      "billingPlans/studentA": plan("studentA"),
    });
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
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
      "billingPlans/studentA": plan("studentA"),
    });
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
    expect(await resolveProfile(signedInAs("newStudent"), "newStudent")).toEqual({
      role: "STUDENT", trainerId: "trainerA", accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null,
    });
  });

  it("refuses an unknown code with the app's own message", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    expect(await claimInvite(signedInAs("newStudent"), "newStudent", CODE, 5)).toEqual({ ok: false, message: "Código de convite inválido" });
  });

  // Rules v4: a spent invite is unreadable to anyone but its trainer, an ADM and the account that
  // claimed it, so a stranger gets the "unavailable" explanation rather than "already used".
  it.each([
    ["used", { used: true }],
    ["cancelled", { cancelledAt: 3 }],
  ])("explains a %s invite as unavailable, without reading it", async (_label, extra) => {
    await seed({ "users/trainerA": { role: "TRAINER" }, [`invites/${CODE}`]: { ...invite, ...extra } });
    expect(await claimInvite(signedInAs("newStudent"), "newStudent", CODE, 5)).toEqual({
      ok: false,
      message: "O convite não está disponível. Ele pode ter sido pausado, cancelado ou usado, ou sua conta já estar vinculada. Peça ao personal para conferir ou reativar o cadastro.",
    });
  });

  it("explains, instead of showing Firebase's error, when the account already belongs to a trainer", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      [`invites/${CODE}`]: invite,
      "users/taken": { role: "STUDENT", trainerId: "trainerB", inviteCode: "OLD", name: "Maria", createdAt: 1 },
    });
    expect(await claimInvite(signedInAs("taken"), "taken", CODE, 5)).toEqual({
      ok: false,
      message: "O convite não está disponível. Ele pode ter sido pausado, cancelado ou usado, ou sua conta já estar vinculada. Peça ao personal para conferir ou reativar o cadastro.",
    });
    expect((await read(`invites/${CODE}`))?.used).toBe(false);
  });

  it("resolves a trainer, and an account with no document yet as an unclaimed student", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    expect(await resolveProfile(signedInAs("trainerA"), "trainerA")).toEqual({
      role: "TRAINER", trainerId: null, accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null,
    });
    // Reading one's own users/{uid} before it exists must be allowed, or a new account can't load.
    expect(await resolveProfile(signedInAs("brandNew"), "brandNew")).toEqual({
      role: "STUDENT", trainerId: null, accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null,
    });
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

describe("§26e admin data and §26f activity", () => {
  async function read(path: string): Promise<Record<string, unknown> | undefined> {
    let data: Record<string, unknown> | undefined;
    await env.withSecurityRulesDisabled(async (context) => { data = (await context.firestore().doc(path).get()).data(); });
    return data;
  }

  it("tracks counters across calls and month boundaries, with unique local active days", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    const db = signedInAs("trainerA");
    await trackActivity(db, "trainerA", "login", Date.parse("2026-10-31T23:30:00-03:00"), ZONE);
    expect(await read("users/trainerA")).toMatchObject({ role: "TRAINER" });
    expect(await read("trainerActivity/trainerA_2026-10")).toBeDefined();
    await trackActivity(db, "trainerA", "studentCreated", Date.parse("2026-10-31T23:40:00-03:00"), ZONE);
    await trackActivity(db, "trainerA", "login", Date.parse("2026-11-01T00:10:00-03:00"), ZONE);
    const october = await loadActivity(db, "trainerA", ["2026-10"]);
    const november = await loadActivity(db, "trainerA", ["2026-11"]);
    expect(october[0]).toMatchObject({ actions: { login: 1, studentCreated: 1 }, activeDays: ["2026-10-31"] });
    expect(november[0]).toMatchObject({ actions: { login: 1 }, activeDays: ["2026-11-01"] });
  });

  it("swallows an activity permission error", async () => {
    await expect(trackActivity(signedInAs("no-profile"), "no-profile", "login", 1, ZONE)).resolves.toBeUndefined();
  });

  it("loads only trainers and counts only that trainer's linked students", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER", name: "Ana", email: "ana@example.test" },
      "users/admin": { role: "ADM" },
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
      "users/studentB": { role: "STUDENT", trainerId: "trainerB" },
    });
    const trainers = await loadTrainers(signedInAs("admin"));
    expect(trainers.map((trainer) => trainer.id)).toEqual(["trainerA"]);
    expect(await countLinkedStudents(signedInAs("admin"), "trainerA")).toBe(1);
  });

  it("sets access status and appends the audit entry in the same batch", async () => {
    await seed({ "users/admin": { role: "ADM" }, "users/trainerA": { role: "TRAINER" } });
    await setAccessStatus(signedInAs("admin"), "admin", "trainerA", "suspended", "revisão");
    expect(await read("users/trainerA")).toMatchObject({ accessStatus: "suspended", suspendedReason: "revisão" });
    let entries: Record<string, unknown>[] = [];
    await env.withSecurityRulesDisabled(async (context) => {
      entries = (await context.firestore().collection("adminAudit").get()).docs.map((document) => document.data());
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ adminUid: "admin", action: "trainer.suspend", targetUid: "trainerA", note: "revisão" });
  });

  it("writes dashboard summaries and throttles last-seen updates", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    const db = signedInAs("trainerA");
    const snapshot = await loadTrainerSnapshot(db, "trainerA");
    const figures = dashboardFigures(snapshot, "2026-10-01", ZONE);
    await writeTrainerStats(db, "trainerA", figures, snapshot, Date.parse("2026-10-01T12:00:00-03:00"));
    const stats = await read("trainerStats/trainerA");
    expect(stats).toMatchObject({ trainerId: "trainerA", students: { total: 0, linked: 0, pending: 0 }, billing: { month: "2026-10" } });
    await writeTrainerStats(db, "trainerA", figures, snapshot, Date.parse("2026-10-01T12:05:00-03:00"));
    expect(await read("trainerStats/trainerA")).toEqual(stats);
  });
});

describe("treinos (GOALS.md §23g)", () => {
  function stored(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      trainerId: "trainerA",
      studentId: "s1",
      name: "Treino A",
      isActive: true,
      exercisesJson: "[]",
      createdAt: 1,
      status: "assigned",
      assignedAt: 1,
      ...overrides,
    };
  }

  it("the student sees a treino only while it is assigned — a draft is never theirs to read", async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
      "workouts/shown": stored({ name: "Visível" }),
      "workouts/hidden": stored({ name: "Escondido", isActive: false, status: "draft", assignedAt: null }),
    });
    // The phone's student query (StudentRepository), through the real rules.
    const student = signedInAs("s1");
    expect((await loadMyWorkouts(student, "s1")).map((w) => w.name)).toEqual(["Visível"]);
    await assertFails(getDoc(doc(student, "workouts", "hidden")));
    // The trainer still reads both, newest first.
    expect((await loadStudentWorkouts(signedInAs("trainerA"), "trainerA", "s1")).map((w) => w.id).sort()).toEqual(["hidden", "shown"]);
  });

  it("lists only this trainer's treinos for the student, newest first", async () => {
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
  });
});

// GOALS.md §34 — a ficha is a named set of treinos, at most two per student; a third deletes the oldest, in one batch.
describe("fichas as named sets of treinos (GOALS.md §34)", () => {
  const exercises = [
    { name: "Supino", sets: 3, reps: "12", weight: null, restSeconds: null, notes: null, muscleActivation: null },
  ];
  const INACTIVE = { isActive: false, status: "draft", assignedAt: null };

  function stored(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      trainerId: "trainerA",
      studentId: "s1",
      name: "Treino",
      isActive: true,
      exercisesJson: "[]",
      createdAt: 1,
      status: "assigned",
      assignedAt: 1,
      ...overrides,
    };
  }

  /** A document as it is in the database, read with the rules off — what the tests assert against. */
  async function stateOf(path: string): Promise<Record<string, unknown> | null> {
    let data: Record<string, unknown> | null = null;
    await env.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.firestore().doc(path).get();
      data = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
    });
    return data;
  }

  /** Every document id in `workouts`, rules off. */
  async function workoutIds(): Promise<string[]> {
    let ids: string[] = [];
    await env.withSecurityRulesDisabled(async (context) => {
      ids = (await context.firestore().collection("workouts").get()).docs.map((d) => d.id).sort();
    });
    return ids;
  }

  const draft = (name: string, ...treinos: string[]): FichaDraft => ({
    name,
    treinos: treinos.map((treino) => ({ name: treino, exercises })),
  });

  beforeEach(async () => {
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA", inviteCode: "X", name: "Ana", createdAt: 1 },
      "users/s2": { role: "STUDENT", trainerId: "trainerA", inviteCode: "Y", name: "Bia", createdAt: 1 },
    });
  });

  it("creates a ficha: every treino shares one ficha id, in order, active, and the student sees them", async () => {
    const trainer = signedInAs("trainerA");
    const { created, deleted } = await createFicha(trainer, "trainerA", "s1", draft("  Hipertrofia  ", "Treino A", "Treino B", "Treino C"), 1000);
    expect(deleted).toEqual([]);
    expect(created).toMatchObject({ name: "Hipertrofia", legacy: false, createdAt: 1000, updatedAt: 1000 });
    expect(created.treinos.map((t) => t.name)).toEqual(["Treino A", "Treino B", "Treino C"]);

    for (const [index, treino] of created.treinos.entries()) {
      const document = await stateOf(`workouts/${treino.id}`);
      expect(document).toMatchObject({
        trainerId: "trainerA",
        studentId: "s1",
        name: treino.name,
        isActive: true,
        status: "assigned",
        createdAt: 1000,
        assignedAt: 1000,
        ficha: { id: created.id, name: "Hipertrofia", createdAt: 1000, updatedAt: 1000, order: index },
      });
    }
    expect((await loadStudentFichas(trainer, "trainerA", "s1")).map((f) => f.name)).toEqual(["Hipertrofia"]);
    expect((await loadMyWorkouts(signedInAs("s1"), "s1")).map((w) => w.name)).toEqual(["Treino A", "Treino B", "Treino C"]);
  });

  it("a second ficha sits beside the first, newest first, and nothing is deleted", async () => {
    const trainer = signedInAs("trainerA");
    await createFicha(trainer, "trainerA", "s1", draft("Primeira", "Treino A"), 1000);
    const second = await createFicha(trainer, "trainerA", "s1", draft("Segunda", "Treino A"), 2000);
    expect(second.deleted).toEqual([]);
    expect((await loadStudentFichas(trainer, "trainerA", "s1")).map((f) => f.name)).toEqual(["Segunda", "Primeira"]);
    expect((await loadMyWorkouts(signedInAs("s1"), "s1")).length).toBe(2);
  });

  it("a THIRD ficha deletes exactly the oldest ficha's treinos — and nothing else", async () => {
    const trainer = signedInAs("trainerA");
    const first = await createFicha(trainer, "trainerA", "s1", draft("Primeira", "Treino A", "Treino B"), 1000);
    const second = await createFicha(trainer, "trainerA", "s1", draft("Segunda", "Treino A"), 2000);
    await seed({
      "workouts/other-student": stored({ studentId: "s2", name: "De outro aluno" }),
      "workouts/hidden-history": stored({ name: "Antigo", ...INACTIVE, archivedAt: 50 }),
      "workouts/hidden-draft": stored({ name: "Rascunho", ...INACTIVE }),
      "workoutLogs/log1": {
        trainerId: "trainerA",
        studentId: "s1",
        workoutId: first.created.treinos[0].id,
        exerciseName: "Supino",
        date: 1,
        performedSetsJson: "[]",
        note: null,
      },
    });

    const third = await createFicha(trainer, "trainerA", "s1", draft("Terceira", "Treino A"), 3000);
    expect(third.deleted.map((f) => f.name)).toEqual(["Primeira"]);
    for (const treino of first.created.treinos) expect(await stateOf(`workouts/${treino.id}`)).toBeNull();
    for (const treino of [...second.created.treinos, ...third.created.treinos]) {
      expect(await stateOf(`workouts/${treino.id}`)).not.toBeNull();
    }
    // Untouched: another student's treino, the hidden pre-ficha treinos, the student's log.
    expect(await stateOf("workouts/other-student")).toMatchObject({ name: "De outro aluno", isActive: true });
    expect(await stateOf("workouts/hidden-history")).toMatchObject({ name: "Antigo", isActive: false });
    expect(await stateOf("workouts/hidden-draft")).toMatchObject({ name: "Rascunho", isActive: false });
    expect(await stateOf("workoutLogs/log1")).not.toBeNull();

    expect((await loadStudentFichas(trainer, "trainerA", "s1")).map((f) => f.name)).toEqual(["Terceira", "Segunda"]);
    expect((await loadMyWorkouts(signedInAs("s1"), "s1")).map((w) => w.name)).toEqual(["Treino A", "Treino A"]);
  });

  it("when the oldest is the pre-ficha one, its active treinos go; the hidden ones stay", async () => {
    const trainer = signedInAs("trainerA");
    await seed({
      "workouts/l1": stored({ name: "Treino A", createdAt: 10 }),
      "workouts/l2": stored({ name: "Treino B", createdAt: 11 }),
      "workouts/hidden": stored({ name: "Rascunho", createdAt: 12, ...INACTIVE }),
    });
    const real = await createFicha(trainer, "trainerA", "s1", draft("Real", "Treino A"), 2000);
    expect((await loadStudentFichas(trainer, "trainerA", "s1")).map((f) => f.name)).toEqual(["Real", "Ficha atual"]);

    const third = await createFicha(trainer, "trainerA", "s1", draft("Nova", "Treino A"), 3000);
    expect(third.deleted.map((f) => f.name)).toEqual(["Ficha atual"]);
    expect(await stateOf("workouts/l1")).toBeNull();
    expect(await stateOf("workouts/l2")).toBeNull();
    expect(await stateOf("workouts/hidden")).not.toBeNull();
    expect(await stateOf(`workouts/${real.created.treinos[0].id}`)).not.toBeNull();
  });

  it("is all-or-nothing: a creation the rules refuse deletes nothing either", async () => {
    // s3 belongs to trainerB, so trainerA may not create treinos for them — yet two fichas of trainerA's sit there.
    await seed({
      "users/s3": { role: "STUDENT", trainerId: "trainerB", inviteCode: "Z", name: "Caio", createdAt: 1 },
      "workouts/old1": stored({ studentId: "s3", name: "Velha", createdAt: 100, ficha: { id: "fa", name: "A", createdAt: 100, updatedAt: 100, order: 0 } }),
      "workouts/old2": stored({ studentId: "s3", name: "Nova", createdAt: 200, ficha: { id: "fb", name: "B", createdAt: 200, updatedAt: 200, order: 0 } }),
    });
    await expect(createFicha(signedInAs("trainerA"), "trainerA", "s3", draft("Terceira", "Treino A"), 3000)).rejects.toThrow();
    expect(await workoutIds()).toEqual(["old1", "old2"]);
  });

  it("another trainer or the student cannot create, save or delete a ficha — nothing changes", async () => {
    const trainer = signedInAs("trainerA");
    const { created } = await createFicha(trainer, "trainerA", "s1", draft("Primeira", "Treino A"), 1000);
    const before = await workoutIds();
    for (const who of ["trainerB", "s1"]) {
      const db = signedInAs(who);
      await expect(createFicha(db, "trainerA", "s1", draft("Intrusa", "Treino A"), 2000)).rejects.toThrow();
      await expect(deleteFicha(db, "trainerA", "s1", created.id)).rejects.toThrow();
      await expect(
        saveFicha(db, "trainerA", "s1", created.id, { name: "Hackeada", treinos: [{ id: created.treinos[0].id, name: "X", exercises }] }, 2000),
      ).rejects.toThrow();
    }
    expect(await workoutIds()).toEqual(before);
    expect(await stateOf(`workouts/${created.treinos[0].id}`)).toMatchObject({ name: "Treino A", ficha: { name: "Primeira" } });
  });

  it("saveFicha: renames it, keeps what it keeps, adds and removes treinos, stamps the new date", async () => {
    const trainer = signedInAs("trainerA");
    const { created } = await createFicha(trainer, "trainerA", "s1", draft("Antes", "Treino A", "Treino B"), 1000);
    const [a, b] = created.treinos;
    const other = [{ ...exercises[0], name: "Remada", sets: 4 }];

    const saved = await saveFicha(
      trainer,
      "trainerA",
      "s1",
      created.id,
      {
        name: "Depois",
        treinos: [
          { id: a.id, name: "Treino A — novo foco", exercises: other },
          { id: null, name: "Treino C", exercises },
        ],
      },
      2000,
    );
    expect(saved).toMatchObject({ id: created.id, name: "Depois", createdAt: 1000, updatedAt: 2000 });

    expect(await stateOf(`workouts/${a.id}`)).toMatchObject({
      name: "Treino A — novo foco",
      createdAt: 1000,
      assignedAt: 1000,
      isActive: true,
      status: "assigned",
      ficha: { id: created.id, name: "Depois", createdAt: 1000, updatedAt: 2000, order: 0 },
    });
    expect(String((await stateOf(`workouts/${a.id}`))?.exercisesJson)).toContain("Remada");
    expect(await stateOf(`workouts/${b.id}`)).toBeNull();
    const added = saved.treinos[1];
    expect(await stateOf(`workouts/${added.id}`)).toMatchObject({
      name: "Treino C",
      ficha: { id: created.id, name: "Depois", createdAt: 1000, updatedAt: 2000, order: 1 },
    });
    expect((await loadStudentFichas(trainer, "trainerA", "s1")).map((f) => [f.name, f.updatedAt, f.treinos.length])).toEqual([["Depois", 2000, 2]]);
  });

  it("saveFicha refuses a treino id of another ficha, and writes nothing", async () => {
    const trainer = signedInAs("trainerA");
    const one = await createFicha(trainer, "trainerA", "s1", draft("Um", "Treino A"), 1000);
    const two = await createFicha(trainer, "trainerA", "s1", draft("Dois", "Treino A"), 2000);
    const before = await stateOf(`workouts/${two.created.treinos[0].id}`);
    await expect(
      saveFicha(trainer, "trainerA", "s1", one.created.id, { name: "Um", treinos: [{ id: two.created.treinos[0].id, name: "Roubado", exercises }] }, 3000),
    ).rejects.toThrow(/does not belong/);
    expect(await stateOf(`workouts/${two.created.treinos[0].id}`)).toEqual(before);
    expect(await stateOf(`workouts/${one.created.treinos[0].id}`)).toMatchObject({ name: "Treino A" });
  });

  it("saving the pre-ficha one ADOPTS it: new ficha id, the typed name, the same place in the order; hidden treinos stay", async () => {
    const trainer = signedInAs("trainerA");
    await seed({
      "workouts/l1": stored({ name: "Treino A", createdAt: 10, assignedAt: 10 }),
      "workouts/l2": stored({ name: "Treino B", createdAt: 11, assignedAt: 11 }),
      "workouts/hidden": stored({ name: "Rascunho", createdAt: 12, ...INACTIVE }),
    });
    const saved = await saveFicha(
      trainer,
      "trainerA",
      "s1",
      "legacy",
      { name: "Minha ficha", treinos: [{ id: "l1", name: "Treino A", exercises }, { id: "l2", name: "Treino B", exercises }] },
      5000,
    );
    expect(saved.id).not.toBe("legacy");
    expect(saved).toMatchObject({ name: "Minha ficha", legacy: false, createdAt: 10, updatedAt: 5000 });
    expect(await stateOf("workouts/l1")).toMatchObject({ createdAt: 10, ficha: { id: saved.id, name: "Minha ficha", createdAt: 10, order: 0 } });
    expect(await stateOf("workouts/hidden")).not.toHaveProperty("ficha");
    const fichas = await loadStudentFichas(trainer, "trainerA", "s1");
    expect(fichas.map((f) => [f.name, f.legacy])).toEqual([["Minha ficha", false]]);
  });

  it("deleteFicha removes exactly its treinos; a stale call throws FichaNotFound and writes nothing", async () => {
    const trainer = signedInAs("trainerA");
    const one = await createFicha(trainer, "trainerA", "s1", draft("Um", "Treino A", "Treino B"), 1000);
    const two = await createFicha(trainer, "trainerA", "s1", draft("Dois", "Treino A"), 2000);
    await seed({ "workouts/other-student": stored({ studentId: "s2" }), "workouts/hidden": stored({ ...INACTIVE }) });

    await deleteFicha(trainer, "trainerA", "s1", one.created.id);
    for (const treino of one.created.treinos) expect(await stateOf(`workouts/${treino.id}`)).toBeNull();
    expect(await workoutIds()).toEqual([...two.created.treinos.map((t) => t.id), "hidden", "other-student"].sort());

    const before = await workoutIds();
    await expect(deleteFicha(trainer, "trainerA", "s1", one.created.id)).rejects.toBeInstanceOf(FichaNotFound);
    expect(await workoutIds()).toEqual(before);
  });

  it("refuses a ficha too big for one batch before writing anything", async () => {
    const trainer = signedInAs("trainerA");
    const huge = draft("Enorme", ...Array.from({ length: 451 }, (_, i) => `Treino ${i + 1}`));
    await expect(createFicha(trainer, "trainerA", "s1", huge, 1000)).rejects.toBeInstanceOf(FichaTooLarge);
    expect(await workoutIds()).toEqual([]);
  });

  it("refuses a ficha that is not valid (no name, no treino, a treino without exercises)", async () => {
    const trainer = signedInAs("trainerA");
    await expect(createFicha(trainer, "trainerA", "s1", draft(" ", "Treino A"), 1000)).rejects.toThrow(/Nome da ficha/);
    await expect(createFicha(trainer, "trainerA", "s1", draft("X"), 1000)).rejects.toThrow(/pelo menos um treino/);
    await expect(
      createFicha(trainer, "trainerA", "s1", { name: "X", treinos: [{ name: "Treino A", exercises: [] }] }, 1000),
    ).rejects.toThrow(/pelo menos um exercício/);
    expect(await workoutIds()).toEqual([]);
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
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA" },
    });
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
    await seed({
      "users/trainerA": { role: "TRAINER" },
      "users/trainerB": { role: "TRAINER" },
      "users/s1": { role: "STUDENT", trainerId: "trainerA" },
      "billingPlans/s1": plan("s1"),
    });
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
