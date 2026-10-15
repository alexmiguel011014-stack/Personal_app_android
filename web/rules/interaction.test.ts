import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";

// Rules version 8 (GOALS.md §38h): the aluno's feedback on a session and the personal's answer on the same document,
// the personal's opt-in contact card, and the key/size limits on a new assessment. Same harness as
// firestore.rules.test.ts; RULES_FILE=<previous version> npm run test:rules shows every denial here failing to hold.
const RULES_FILE = process.env.RULES_FILE ?? fileURLToPath(new URL("../../firestore.rules", import.meta.url));

let env: RulesTestEnvironment;

const TRAINER_A = "trainerA";
const TRAINER_B = "trainerB";
const STUDENT_A = "studentA"; // linked to trainerA
const STUDENT_A2 = "studentA2"; // also linked to trainerA

type Db = ReturnType<ReturnType<RulesTestEnvironment["unauthenticatedContext"]>["firestore"]>;

const as = (uid: string): Db => env.authenticatedContext(uid, { email_verified: true }).firestore();
const anonymous = (): Db => env.unauthenticatedContext().firestore();
const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

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
  });
});

describe("sessionFeedback", () => {
  const DAY = "2026-10-14";
  const ID = `${STUDENT_A}_${DAY}`;
  const alunoDoc = (extra: Record<string, unknown> = {}) => ({
    studentId: STUDENT_A, trainerId: TRAINER_A, day: DAY, effort: 8, pain: true, studentComment: "Joelho doeu", studentAt: stamp(), ...extra,
  });
  const patch = (extra: Record<string, unknown> = {}) => ({ studentId: STUDENT_A, trainerId: TRAINER_A, day: DAY, ...extra });
  const existing = () =>
    seed((db) =>
      db.doc(`sessionFeedback/${ID}`).set({
        studentId: STUDENT_A, trainerId: TRAINER_A, day: DAY, effort: 8, pain: true, studentComment: "Joelho doeu", studentAt: new Date(),
      }),
    );

  it("lets the aluno create their own feedback, attributed to their own trainer", async () => {
    await assertSucceeds(as(STUDENT_A).doc(`sessionFeedback/${ID}`).set(alunoDoc()));
    await assertSucceeds(as(STUDENT_A2).doc(`sessionFeedback/${STUDENT_A2}_${DAY}`).set(alunoDoc({ studentId: STUDENT_A2 })));
  });

  it("refuses feedback in another aluno's name, for another trainer, or under another id", async () => {
    await assertFails(as(STUDENT_A2).doc(`sessionFeedback/${ID}`).set(alunoDoc()));
    await assertFails(as(STUDENT_A).doc(`sessionFeedback/${ID}`).set(alunoDoc({ trainerId: TRAINER_B })));
    await assertFails(as(STUDENT_A).doc(`sessionFeedback/${STUDENT_A}_2026-10-15`).set(alunoDoc()));
    await assertFails(as(STUDENT_A).doc(`sessionFeedback/${STUDENT_A}_14-10-2026`).set(alunoDoc({ day: "14-10-2026" })));
    await assertFails(anonymous().doc(`sessionFeedback/${ID}`).set(alunoDoc()));
  });

  it("checks the aluno's values and stamps", async () => {
    const ref = as(STUDENT_A).doc(`sessionFeedback/${ID}`);
    await assertFails(ref.set(alunoDoc({ effort: 11 })));
    await assertFails(ref.set(alunoDoc({ effort: "8" })));
    await assertFails(ref.set(alunoDoc({ pain: "sim" })));
    await assertFails(ref.set(alunoDoc({ studentComment: "x".repeat(501) })));
    await assertFails(ref.set(alunoDoc({ studentComment: "a\tb" })));
    await assertFails(ref.set(alunoDoc({ studentAt: new Date() })));
    await assertFails(ref.set(without(alunoDoc(), "studentAt")));
    await assertFails(ref.set(alunoDoc({ trainerComment: "eu mesmo" })));
    await assertFails(ref.set(alunoDoc({ trainerSeenAt: stamp() })));
    await assertSucceeds(ref.set(alunoDoc({ effort: null, pain: false, studentComment: "Linha 1\nLinha 2" })));
  });

  it("lets the aluno change only their own fields, with a fresh stamp", async () => {
    await existing();
    const ref = as(STUDENT_A).doc(`sessionFeedback/${ID}`);
    await assertSucceeds(ref.set(patch({ effort: 6, studentAt: stamp() }), { merge: true }));
    await assertFails(ref.set(patch({ effort: 4 }), { merge: true }));
    await assertFails(ref.set(patch({ trainerComment: "ótimo", trainerAt: stamp() }), { merge: true }));
    await assertFails(ref.set(patch({ trainerSeenAt: stamp() }), { merge: true }));
    await assertFails(ref.set(patch({ trainerId: TRAINER_B, studentAt: stamp() }), { merge: true }));
    await assertSucceeds(ref.set(patch({ studentSeenAt: stamp() }), { merge: true }));
  });

  it("lets only the aluno and their own personal read it", async () => {
    await existing();
    await assertSucceeds(as(STUDENT_A).doc(`sessionFeedback/${ID}`).get());
    await assertSucceeds(as(TRAINER_A).doc(`sessionFeedback/${ID}`).get());
    await assertFails(as(STUDENT_A2).doc(`sessionFeedback/${ID}`).get());
    await assertFails(as(TRAINER_B).doc(`sessionFeedback/${ID}`).get());
    await assertFails(as("adminA").doc(`sessionFeedback/${ID}`).get());
    await assertFails(anonymous().doc(`sessionFeedback/${ID}`).get());
    await assertSucceeds(as(TRAINER_A).collection("sessionFeedback").where("trainerId", "==", TRAINER_A).get());
    await assertSucceeds(as(STUDENT_A).collection("sessionFeedback").where("studentId", "==", STUDENT_A).get());
    await assertFails(as(TRAINER_B).collection("sessionFeedback").where("trainerId", "==", TRAINER_A).get());
    await assertFails(as(STUDENT_A2).collection("sessionFeedback").where("studentId", "==", STUDENT_A).get());
  });

  it("lets the owning personal mark it seen and comment, touching only their fields", async () => {
    await existing();
    const ref = as(TRAINER_A).doc(`sessionFeedback/${ID}`);
    await assertSucceeds(ref.set(patch({ trainerSeenAt: stamp() }), { merge: true }));
    await assertSucceeds(ref.set(patch({ trainerComment: "Vamos ver esse joelho", trainerAt: stamp() }), { merge: true }));
    await assertFails(ref.set(patch({ trainerComment: "sem carimbo" }), { merge: true }));
    await assertFails(ref.set(patch({ trainerComment: "x".repeat(1001), trainerAt: stamp() }), { merge: true }));
    await assertFails(ref.set(patch({ trainerSeenAt: new Date() }), { merge: true }));
    await assertFails(ref.set(patch({ effort: 2 }), { merge: true }));
    await assertFails(ref.set(patch({ pain: false }), { merge: true }));
    await assertFails(ref.set(patch({ studentComment: "reescrito" }), { merge: true }));
    await assertFails(ref.set(patch({ studentSeenAt: stamp() }), { merge: true }));
  });

  it("refuses another personal", async () => {
    await existing();
    await assertFails(as(TRAINER_B).doc(`sessionFeedback/${ID}`).set(patch({ trainerSeenAt: stamp() }), { merge: true }));
    await assertFails(
      as(TRAINER_B).doc(`sessionFeedback/${STUDENT_A}_2026-10-13`).set(patch({ day: "2026-10-13", trainerId: TRAINER_B, trainerSeenAt: stamp() })),
    );
  });

  it("lets the personal answer a session the aluno gave no feedback on, and the aluno add theirs afterwards", async () => {
    const day = "2026-10-13";
    const ref = (uid: string) => as(uid).doc(`sessionFeedback/${STUDENT_A}_${day}`);
    await assertSucceeds(ref(TRAINER_A).set(patch({ day, trainerSeenAt: stamp() })));
    await assertSucceeds(ref(STUDENT_A).set(patch({ day, effort: 6, studentAt: stamp() }), { merge: true }));
  });

  it("cannot be deleted by anyone", async () => {
    await existing();
    await assertFails(as(STUDENT_A).doc(`sessionFeedback/${ID}`).delete());
    await assertFails(as(TRAINER_A).doc(`sessionFeedback/${ID}`).delete());
    await assertFails(as("adminA").doc(`sessionFeedback/${ID}`).delete());
  });

  it("stops the personal's side when their access is suspended or their billing is blocked", async () => {
    await existing();
    await seed((db) => db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER", accessStatus: "suspended" }));
    await assertFails(as(TRAINER_A).doc(`sessionFeedback/${ID}`).set(patch({ trainerSeenAt: stamp() }), { merge: true }));
    await assertFails(as(TRAINER_A).doc(`sessionFeedback/${ID}`).get());
    await assertSucceeds(as(STUDENT_A).doc(`sessionFeedback/${ID}`).get());
    await seed((db) => db.doc(`users/${TRAINER_A}`).set({ role: "TRAINER", platformBillingStatus: "blocked" }));
    await assertFails(as(TRAINER_A).doc(`sessionFeedback/${ID}`).get());
  });

  it("keeps a paused aluno's access to their own feedback", async () => {
    await existing();
    await seed((db) => db.doc(`users/${STUDENT_A}`).update({ paused: true }));
    await assertSucceeds(as(STUDENT_A).doc(`sessionFeedback/${ID}`).get());
    await assertSucceeds(as(STUDENT_A).doc(`sessionFeedback/${ID}`).set(patch({ effort: 4, studentAt: stamp() }), { merge: true }));
  });
});

describe("trainerContacts", () => {
  const card = (extra: Record<string, unknown> = {}) => ({ name: "Ana Paula", whatsapp: "5511999990000", updatedAt: stamp(), ...extra });
  const stored = () =>
    seed((db) => db.doc(`trainerContacts/${TRAINER_A}`).set({ name: "Ana Paula", whatsapp: "5511999990000", updatedAt: new Date() }));

  it("lets the personal write their own card and nobody else's", async () => {
    await assertSucceeds(as(TRAINER_A).doc(`trainerContacts/${TRAINER_A}`).set(card()));
    await assertSucceeds(as(TRAINER_A).doc(`trainerContacts/${TRAINER_A}`).set(card({ name: "Ana P." })));
    await assertFails(as(TRAINER_B).doc(`trainerContacts/${TRAINER_A}`).set(card()));
    await assertFails(as(STUDENT_A).doc(`trainerContacts/${TRAINER_A}`).set(card()));
    await assertFails(as("adminA").doc(`trainerContacts/${TRAINER_A}`).set(card()));
  });

  it("checks the card's keys, name, number and stamp", async () => {
    const ref = as(TRAINER_A).doc(`trainerContacts/${TRAINER_A}`);
    await assertFails(ref.set(card({ extra: 1 })));
    await assertFails(ref.set(card({ name: "A" })));
    await assertFails(ref.set(card({ name: " Ana " })));
    await assertFails(ref.set(card({ name: "x".repeat(81) })));
    await assertFails(ref.set(card({ whatsapp: "12345" })));
    await assertFails(ref.set(card({ whatsapp: "(11) 99999-0000" })));
    await assertFails(ref.set(card({ whatsapp: "55119999900001" })));
    await assertFails(ref.set(card({ updatedAt: new Date() })));
    await assertFails(ref.set(without(card(), "whatsapp")));
  });

  it("is read by the personal and their linked alunos only", async () => {
    await stored();
    await assertSucceeds(as(TRAINER_A).doc(`trainerContacts/${TRAINER_A}`).get());
    await assertSucceeds(as(STUDENT_A).doc(`trainerContacts/${TRAINER_A}`).get());
    await seed((db) => db.doc(`users/${STUDENT_A2}`).update({ trainerId: TRAINER_B }));
    await assertFails(as(STUDENT_A2).doc(`trainerContacts/${TRAINER_A}`).get());
    await assertFails(as(TRAINER_B).doc(`trainerContacts/${TRAINER_A}`).get());
    await assertFails(as("adminA").doc(`trainerContacts/${TRAINER_A}`).get());
    await assertFails(anonymous().doc(`trainerContacts/${TRAINER_A}`).get());
  });

  it("is deleted by the personal who owns it, when the opt-in is turned off", async () => {
    await stored();
    await assertFails(as(TRAINER_B).doc(`trainerContacts/${TRAINER_A}`).delete());
    await assertFails(as(STUDENT_A).doc(`trainerContacts/${TRAINER_A}`).delete());
    await assertSucceeds(as(TRAINER_A).doc(`trainerContacts/${TRAINER_A}`).delete());
  });
});

describe("assessments: the shape of a new one", () => {
  const phone = () => ({
    studentId: STUDENT_A, trainerId: TRAINER_A, submittedAt: 1, parQAnswersJson: "{}", goal: "Hipertrofia", experienceLevel: "Iniciante", trainingDays: ["Seg"],
  });
  const withAnamnesis = (extra: Record<string, unknown> = {}, answers: Record<string, unknown> = { goal: "Hipertrofia", notes: "ok" }) => ({
    ...phone(), anamnesis: { version: 1, answers }, consentVersion: "anamnese-v1", consentAt: stamp(), ...extra,
  });

  beforeEach(() => seed((db) => db.doc(`users/${STUDENT_A}`).update({ canSelfAssess: true })));

  it("still accepts a phone-shaped assessment", async () => {
    await assertSucceeds(as(STUDENT_A).doc("assessments/p1").set(phone()));
    await assertSucceeds(as(STUDENT_A).doc("assessments/p2").set({ studentId: STUDENT_A, trainerId: TRAINER_A, submittedAt: 2 }));
  });

  it("accepts an anamnese that comes with its consent", async () => {
    await assertSucceeds(as(STUDENT_A).doc("assessments/a1").set(withAnamnesis()));
  });

  it("refuses an unknown key", async () => {
    await assertFails(as(STUDENT_A).doc("assessments/a2").set({ ...phone(), role: "ADM" }));
    await assertFails(as(STUDENT_A).doc("assessments/a3").set(withAnamnesis({ extra: 1 })));
  });

  it("refuses an anamnese without consent, with a client clock, or consent without an anamnese", async () => {
    await assertFails(as(STUDENT_A).doc("assessments/a4").set(without(withAnamnesis(), "consentVersion")));
    await assertFails(as(STUDENT_A).doc("assessments/a5").set(without(withAnamnesis(), "consentAt")));
    await assertFails(as(STUDENT_A).doc("assessments/a6").set(withAnamnesis({ consentAt: new Date() })));
    await assertFails(as(STUDENT_A).doc("assessments/a7").set(withAnamnesis({ consentVersion: "" })));
    await assertFails(as(STUDENT_A).doc("assessments/a8").set({ ...phone(), consentVersion: "anamnese-v1", consentAt: stamp() }));
  });

  it("refuses an oversized or malformed anamnese", async () => {
    await assertFails(as(STUDENT_A).doc("assessments/a9").set(withAnamnesis({}, { notes: "x".repeat(501) })));
    await assertFails(as(STUDENT_A).doc("assessments/b1").set(withAnamnesis({}, { notes: 5 })));
    await assertFails(
      as(STUDENT_A).doc("assessments/b2").set(withAnamnesis({}, Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, true])))),
    );
    await assertFails(as(STUDENT_A).doc("assessments/b3").set(withAnamnesis({ anamnesis: "texto" })));
    await assertFails(as(STUDENT_A).doc("assessments/b4").set(withAnamnesis({ anamnesis: { version: "1", answers: {} } })));
    await assertFails(as(STUDENT_A).doc("assessments/b5").set(withAnamnesis({ anamnesis: { version: 1, answers: {}, extra: 1 } })));
  });
});
