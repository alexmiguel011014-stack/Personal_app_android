import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensureMonthlyCharges, loadTrainerSnapshot } from "../src/data/trainerData";

// GOALS.md §23e: the data layer against the Firestore emulator, through the real rules — the same
// modular SDK calls the app makes, signed in as a given uid. This is where the three layers meet:
// 23c's model, 23d's rules and 23e's converters all have to agree for these writes to land.

const PROJECT_ID = "demo-personal-tracker";
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
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid } });
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
