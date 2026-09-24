// GOALS.md §23f: puts the local emulators into a known state for exercising the web app by hand or
// from a browser — fake accounts and data under the demo project, never the real one.
//
//   1. start the emulators:  npx firebase emulators:start --config ../firebase.json
//                              --project demo-personal-tracker --only auth,firestore
//   2. seed them:            npm run seed:emulators
//   3. run the app on them:  NEXT_PUBLIC_FIREBASE_EMULATORS=true npm run dev
//
// Re-running it wipes both emulators first, so it always ends in the same state.

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-personal-tracker";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = { host: "127.0.0.1", port: 8081 };

const TRAINER = { email: "treinador@teste.dev", password: "senha123" };
const INVITE_CODE = "AB12CD34";

async function resetAuth() {
  const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Auth emulator reset failed: ${response.status} — is it running?`);
}

async function createAccount({ email, password }) {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Couldn't create ${email}: ${JSON.stringify(body)}`);
  return body.localId;
}

const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: FIRESTORE });
try {
  await resetAuth();
  await env.clearFirestore();

  const trainerId = await createAccount(TRAINER);
  const now = Date.now();
  // A draft the trainer registered, and the invite generateInvite would mint for it — same fields.
  const draft = {
    trainerId,
    name: "Maria Souza",
    role: "student",
    gender: "Feminino",
    phone: "11999990000",
    goal: "Hipertrofia",
    experienceLevel: "Iniciante",
    medicalNotes: "",
    trainingDays: ["Segunda", "Quarta", "Sexta"],
    createdAt: now,
  };
  const inviteProfile = {
    name: draft.name,
    gender: draft.gender,
    phone: draft.phone,
    goal: draft.goal,
    experienceLevel: draft.experienceLevel,
    medicalNotes: draft.medicalNotes,
    trainingDays: draft.trainingDays,
  };

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`users/${trainerId}`).set({ role: "TRAINER" });
    await db.doc("students/draft-maria").set(draft);
    await db.doc(`invites/${INVITE_CODE}`).set({
      trainerId,
      used: false,
      createdAt: now,
      draftId: "draft-maria",
      ...inviteProfile,
    });
  });

  console.log("Emulators seeded.");
  console.log(`  trainer: ${TRAINER.email} / ${TRAINER.password}`);
  console.log(`  invite:  http://localhost:3000/convite?c=${INVITE_CODE}  (for "${draft.name}")`);
} finally {
  await env.cleanup();
}
