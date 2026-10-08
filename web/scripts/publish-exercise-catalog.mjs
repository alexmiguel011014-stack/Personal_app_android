// GOALS.md §33 — publishes the trainer's exercise reference to its ONE home, the Firestore document
// `appData/exerciseCatalog`, which only approved trainers and the ADM can read (firestore.rules v6). OWNER-RUN:
// it writes with the ADM's own sign-in, so the rules decide who may do it; nothing here is a service account.
//
//   npm run catalog:publish                      -> the LOCAL emulators (demo project, account admin@teste.dev)
//   npm run catalog:publish -- --production      -> the real project, after you type its id to confirm
//
// The source is the Android asset unless CATALOG_SOURCE=<path> points at a private copy (scripts/lib/catalogSource.mjs).
// Credentials: CATALOG_ADMIN_EMAIL / CATALOG_ADMIN_PASSWORD from the environment, or asked for here (the password
// is typed hidden). They are never stored, never printed and never sent anywhere but Firebase Auth's sign-in.
// Re-running with an unchanged source writes nothing ("already up to date"). Prints only the version and the count.

import { readFileSync } from "node:fs";
import readline from "node:readline";
import { buildCatalog } from "./lib/catalogSource.mjs";

const production = process.argv.includes("--production");
const EMULATOR_PROJECT = "demo-personal-tracker";
const DOC_PATH = "appData/exerciseCatalog";

/** Stops the run with a message and a non-zero exit code. Throws (rather than process.exit) so pending network handles close cleanly. */
class Stop extends Error {}
function fail(message) {
  throw new Stop(message);
}

/** The public web config (identifiers, not secrets) from src/data/firebaseConfig.ts — one place to keep it. */
function productionConfig() {
  const text = readFileSync(new URL("../src/data/firebaseConfig.ts", import.meta.url), "utf8");
  // `\\s`, not `\s`: inside a template literal a lone backslash-s is just "s", and the pattern would never match.
  const pick = (key) => text.match(new RegExp(`${key}:\\s*"([^"]+)"`))?.[1];
  const apiKey = pick("apiKey");
  const projectId = pick("projectId");
  if (!apiKey || !projectId) fail("Could not read apiKey/projectId from src/data/firebaseConfig.ts.");
  return { apiKey, projectId };
}

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (text) => void (text.includes(question) && process.stdout.write(question));
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

/** A JS value as a Firestore REST value; whole numbers are integers, the rest doubles. */
function encode(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
  }
  throw new Error(`Cannot encode ${typeof value}`);
}

async function main() {
  const target = production
    ? (() => {
        const { apiKey, projectId } = productionConfig();
        return {
          label: `PRODUCTION project ${projectId}`,
          projectId,
          signIn: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
          docs: `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`,
        };
      })()
    : {
        label: "the LOCAL emulators",
        projectId: EMULATOR_PROJECT,
        signIn: "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
        docs: `http://127.0.0.1:8081/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents`,
      };

  const catalog = (() => {
    try {
      return buildCatalog();
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  })();
  console.log(`Publishing ${catalog.exercises.length} exercises (version ${catalog.version}) to ${target.label}.`);

  if (production) {
    const typed = await ask(`This writes to the real project. Type its id (${target.projectId}) to continue: `);
    if (typed !== target.projectId) fail("Not confirmed; nothing was written.");
  }

  const email = process.env.CATALOG_ADMIN_EMAIL || (production ? await ask("ADM e-mail: ") : "admin@teste.dev");
  const password = process.env.CATALOG_ADMIN_PASSWORD || (production ? await ask("ADM password: ", true) : "senha123");

  const signedIn = await fetch(target.signIn, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).catch(() => fail("Could not reach Firebase Auth (is the emulator running?)."));
  const signedInBody = await signedIn.json();
  if (!signedIn.ok) fail(`Sign-in failed: ${signedInBody?.error?.message ?? signedIn.status}`);
  const headers = { Authorization: `Bearer ${signedInBody.idToken}`, "Content-Type": "application/json" };

  const current = await fetch(`${target.docs}/${DOC_PATH}`, { headers });
  if (!current.ok && current.status !== 404) {
    fail(`Could not read the current document (${current.status}). Is this account the ADM, and are rules v6 published?`);
  }
  const existingVersion = current.ok ? (await current.json()).fields?.version?.stringValue : null;
  if (existingVersion === catalog.version) {
    console.log("Already up to date; nothing written.");
    return;
  }

  const written = await fetch(`${target.docs}/${DOC_PATH}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      fields: encode({ version: catalog.version, exercises: catalog.exercises, updatedAt: Date.now() }).mapValue.fields,
    }),
  });
  if (!written.ok) {
    const body = await written.json().catch(() => ({}));
    fail(`The write was refused (${written.status}${body?.error?.status ? ` ${body.error.status}` : ""}). Is this account the ADM, and are rules v6 published?`);
  }
  console.log(`Published: ${DOC_PATH} is now version ${catalog.version} (${catalog.exercises.length} exercises).`);
}

main().catch((error) => {
  console.error(error instanceof Stop ? error.message : `Unexpected error: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
