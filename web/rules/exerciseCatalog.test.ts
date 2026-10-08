import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CatalogAccessError, clearExerciseCatalogCache, loadExerciseCatalog } from "../src/data/exerciseCatalog";

// GOALS.md §33 — the gated exercise-reference document, through the real rules and the real data layer, and the
// owner's publish script against the emulators. Synthetic exercises only (§33f): the point is who can read it and
// how it is published, not what it says.

const PROJECT_ID = "demo-personal-tracker";
const RULES_FILE = process.env.RULES_FILE ?? fileURLToPath(new URL("../../firestore.rules", import.meta.url));
const SCRIPT = fileURLToPath(new URL("../scripts/publish-exercise-catalog.mjs", import.meta.url));
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

const SOURCE = [
  "# Fonte sintética",
  "",
  "## Grupo Um",
  "| Exercício | Músculo X | Músculo Y |",
  "|---|---|---|",
  "| Exercício Alfa | 1 | 0,5 |",
  "",
  "## Grupo Dois",
  "| Exercício | 1,0 | 0,75 | 0,5 | 0,25 |",
  "|---|---|---|---|---|",
  "| Exercício Beta | Músculo Y | - | - | Músculo Z |",
  "",
].join("\n");

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
  clearExerciseCatalogCache();
  await env.clearFirestore();
});

afterEach(() => clearExerciseCatalogCache());

function signedInAs(uid: string): Firestore {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator" }, `catalog-${uid}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081").split(":");
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, email_verified: true } });
  return db;
}

async function seed(documents: Record<string, Record<string, unknown>>): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries(documents).map(([path, data]) => db.doc(path).set(data)));
  });
}

const document = (version = "v1") => ({
  version,
  exercises: [{ name: "Exercício Alfa", group: "Grupo Um", muscles: { "Músculo X": 1, "Músculo Y": 0.5 } }],
  updatedAt: 1_700_000_000_000,
});

describe("loadExerciseCatalog", () => {
  it("gives an active trainer the catalog, parsed", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "appData/exerciseCatalog": document() });
    const catalog = await loadExerciseCatalog(signedInAs("trainerA"), "trainerA");
    expect(catalog.version).toBe("v1");
    expect(catalog.exercises[0]).toEqual({ name: "Exercício Alfa", group: "Grupo Um", muscles: { "Músculo X": 1, "Músculo Y": 0.5 } });
  });

  it("says plainly that a student, a suspended trainer and a billing-locked trainer have no access", async () => {
    await seed({
      "users/studentA": { role: "STUDENT", trainerId: "trainerA" },
      "users/trainerSuspended": { role: "TRAINER", accessStatus: "suspended", suspendedAt: 1 },
      "users/trainerLocked": { role: "TRAINER", platformBillingStatus: "blocked", platformBillingUntil: 1 },
      "appData/exerciseCatalog": document(),
    });
    for (const uid of ["studentA", "trainerSuspended", "trainerLocked"]) {
      await expect(loadExerciseCatalog(signedInAs(uid), uid)).rejects.toBeInstanceOf(CatalogAccessError);
    }
  });

  it("remembers the catalog in memory for the same person, and forgets it on clear or for another person", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" }, "users/trainerB": { role: "TRAINER" }, "appData/exerciseCatalog": document("v1") });
    const first = await loadExerciseCatalog(signedInAs("trainerA"), "trainerA");
    await seed({ "appData/exerciseCatalog": document("v2") });
    expect(await loadExerciseCatalog(signedInAs("trainerA"), "trainerA")).toBe(first); // cached, no second read
    expect((await loadExerciseCatalog(signedInAs("trainerB"), "trainerB")).version).toBe("v2"); // another person: its own read
    clearExerciseCatalogCache();
    expect((await loadExerciseCatalog(signedInAs("trainerA"), "trainerA")).version).toBe("v2");
  });

  it("explains a document that was never published, and refuses a malformed one", async () => {
    await seed({ "users/trainerA": { role: "TRAINER" } });
    await expect(loadExerciseCatalog(signedInAs("trainerA"), "trainerA")).rejects.toThrow(/ainda não foram publicados/);
    await seed({ "appData/exerciseCatalog": { version: "v1", exercises: [{ name: "x", group: "g", muscles: { "Músculo X": 2 } }], updatedAt: 1 } });
    await expect(loadExerciseCatalog(signedInAs("trainerA"), "trainerA")).rejects.toThrow(/inválido/);
  });
});

describe("npm run catalog:publish (emulator mode)", () => {
  let dir: string;
  let source: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "catalog-source-"));
    source = join(dir, "source.md");
    writeFileSync(source, SOURCE, "utf8");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function signUp(email: string, password: string): Promise<string> {
    const response = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const body = (await response.json()) as { localId: string };
    return body.localId;
  }

  const run = (email: string, password: string) =>
    execFileSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, CATALOG_SOURCE: source, CATALOG_ADMIN_EMAIL: email, CATALOG_ADMIN_PASSWORD: password },
    });

  type Stored = { version: string; updatedAt: number; exercises: Array<{ name: string; group: string; muscles: Record<string, number> }> };
  async function storedDocument(): Promise<Stored | null> {
    let data: Stored | null = null;
    await env.withSecurityRulesDisabled(async (context) => {
      const snapshot = await context.firestore().doc("appData/exerciseCatalog").get();
      data = snapshot.exists ? (snapshot.data() as Stored) : null;
    });
    return data;
  }

  it("creates the document as the ADM, reports the version and count only, and a second run writes nothing", async () => {
    const uid = await signUp("publisher-adm@teste.dev", "senha123");
    await seed({ [`users/${uid}`]: { role: "ADM" } });

    const first = run("publisher-adm@teste.dev", "senha123");
    expect(first).toMatch(/Published: appData\/exerciseCatalog is now version [0-9a-f]{16} \(2 exercises\)/);
    expect(first).not.toMatch(/senha123|Exercício Alfa|Músculo/); // neither the password nor the content is printed

    const stored = await storedDocument();
    expect(stored?.exercises).toHaveLength(2);
    expect(stored?.exercises[1]).toEqual({ name: "Exercício Beta", group: "Grupo Dois", muscles: { "Músculo Y": 1, "Músculo Z": 0.25 } });
    expect(Number.isInteger(stored?.updatedAt)).toBe(true);

    expect(run("publisher-adm@teste.dev", "senha123")).toContain("Already up to date; nothing written.");
  });

  it("is refused for an account that is not the ADM, and for a wrong password", async () => {
    const uid = await signUp("publisher-trainer@teste.dev", "senha123");
    await seed({ [`users/${uid}`]: { role: "TRAINER" } });
    expect(() => run("publisher-trainer@teste.dev", "senha123")).toThrow(/Command failed/);
    expect(() => run("publisher-trainer@teste.dev", "errada")).toThrow(/Command failed/);
    expect(await storedDocument()).toBeNull();
  });
});
