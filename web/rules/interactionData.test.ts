import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  loadMyFeedback,
  loadStudentFeedback,
  loadTrainerFeedback,
  markTrainerCommentSeen,
  saveMyFeedback,
  saveTrainerResponse,
} from "../src/data/sessionFeedback";
import { loadTrainerContact, removeMyContact, saveMyContact } from "../src/data/trainerContacts";
import { loadTrainerSnapshot } from "../src/data/trainerData";
import { submitAssessment } from "../src/data/assessments";
import { hasUnreadTrainerComment, isUnseenByTrainer } from "../src/domain/sessionFeedback";

// GOALS.md §38h: the feedback and contact-card functions of the data layer, against the emulator through the real rules
// (v8) - the same modular SDK calls the screens make. firestore.rules' own cases are in interaction.test.ts.

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
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc("users/trainerA").set({ role: "TRAINER", name: "Ana Personal" });
    await db.doc("users/trainerB").set({ role: "TRAINER" });
    await db.doc("users/studentA").set({ role: "STUDENT", trainerId: "trainerA", name: "Aluno", canSelfAssess: true });
    await db.doc("users/studentB").set({ role: "STUDENT", trainerId: "trainerA", name: "Outro" });
  });
});

function signedInAs(uid: string): Firestore {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: "emulator" }, `interaction-${uid}-${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081").split(":");
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: { sub: uid, email_verified: true } });
  return db;
}

describe("session feedback through the data layer", () => {
  it("round-trips: the aluno speaks, the personal marks it seen and comments, the aluno reads the comment", async () => {
    const aluno = signedInAs("studentA");
    const personal = signedInAs("trainerA");
    await saveMyFeedback(aluno, "studentA", "trainerA", "2026-10-14", { effort: 8, pain: true, comment: "Joelho doeu" });

    let seenByPersonal = await loadTrainerFeedback(personal, "trainerA", "2026-10-01");
    expect(seenByPersonal).toHaveLength(1);
    expect(seenByPersonal[0]).toMatchObject({ studentId: "studentA", day: "2026-10-14", effort: 8, pain: true, studentComment: "Joelho doeu" });
    expect(seenByPersonal[0].studentAt).toEqual(expect.any(Number));
    expect(isUnseenByTrainer(seenByPersonal[0])).toBe(true);

    await saveTrainerResponse(personal, "trainerA", "studentA", "2026-10-14", { seen: true });
    await saveTrainerResponse(personal, "trainerA", "studentA", "2026-10-14", { comment: "Vamos ver esse joelho" });
    seenByPersonal = await loadTrainerFeedback(personal, "trainerA", "2026-10-01");
    expect(isUnseenByTrainer(seenByPersonal[0])).toBe(false);
    expect(seenByPersonal[0].trainerComment).toBe("Vamos ver esse joelho");
    // The aluno's own fields survived the personal's writes.
    expect(seenByPersonal[0]).toMatchObject({ effort: 8, pain: true, studentComment: "Joelho doeu" });

    const mine = await loadMyFeedback(aluno, "studentA", "2026-10-01");
    expect(mine).toHaveLength(1);
    expect(hasUnreadTrainerComment(mine[0])).toBe(true);
    await markTrainerCommentSeen(aluno, "studentA", "trainerA", "2026-10-14");
    expect(hasUnreadTrainerComment((await loadMyFeedback(aluno, "studentA", "2026-10-01"))[0])).toBe(false);
  });

  it("lets the aluno change their answer and keeps the personal's fields", async () => {
    const aluno = signedInAs("studentA");
    const personal = signedInAs("trainerA");
    await saveMyFeedback(aluno, "studentA", "trainerA", "2026-10-14", { effort: 8, pain: true, comment: "" });
    await saveTrainerResponse(personal, "trainerA", "studentA", "2026-10-14", { seen: true, comment: "ok" });
    await saveMyFeedback(aluno, "studentA", "trainerA", "2026-10-14", { effort: 4, pain: false, comment: "melhorou" });
    const [item] = await loadMyFeedback(aluno, "studentA", "2026-10-01");
    expect(item).toMatchObject({ effort: 4, pain: false, studentComment: "melhorou", trainerComment: "ok" });
    expect(item.trainerSeenAt).not.toBeNull();
  });

  it("lets the personal answer a session the aluno said nothing about", async () => {
    const personal = signedInAs("trainerA");
    await saveTrainerResponse(personal, "trainerA", "studentA", "2026-10-13", { seen: true });
    const [item] = await loadStudentFeedback(personal, "trainerA", "studentA", "2026-10-01");
    expect(item).toMatchObject({ studentId: "studentA", effort: null, pain: false, studentAt: null });
    expect(item.trainerSeenAt).not.toBeNull();
  });

  it("windows the reads by day and keeps another aluno's and another personal's out", async () => {
    await saveMyFeedback(signedInAs("studentA"), "studentA", "trainerA", "2026-09-01", { effort: 2, pain: false, comment: "" });
    await saveMyFeedback(signedInAs("studentA"), "studentA", "trainerA", "2026-10-14", { effort: 6, pain: false, comment: "" });
    await saveMyFeedback(signedInAs("studentB"), "studentB", "trainerA", "2026-10-14", { effort: 10, pain: true, comment: "" });
    const personal = signedInAs("trainerA");
    expect((await loadTrainerFeedback(personal, "trainerA", "2026-10-01")).map((f) => f.studentId).sort()).toEqual(["studentA", "studentB"]);
    expect(await loadTrainerFeedback(personal, "trainerA", "2026-09-01", "2026-10-01")).toHaveLength(1);
    expect(await loadStudentFeedback(personal, "trainerA", "studentB", "2026-01-01")).toHaveLength(1);
    expect(await loadMyFeedback(signedInAs("studentA"), "studentA", "2026-01-01")).toHaveLength(2);
    await expect(loadTrainerFeedback(signedInAs("trainerB"), "trainerA", "2026-01-01")).rejects.toThrow();
  });

  it("is part of the trainer's snapshot for the last days, and an unreadable window leaves the snapshot intact", async () => {
    const now = Date.now();
    const day = new Date(now - 3_600_000).toISOString().slice(0, 10);
    await saveMyFeedback(signedInAs("studentA"), "studentA", "trainerA", day, { effort: 6, pain: false, comment: "ok" });
    const snapshot = await loadTrainerSnapshot(signedInAs("trainerA"), "trainerA", now);
    expect(snapshot.feedback.map((f) => f.studentId)).toEqual(["studentA"]);
  });
});

describe("the contact card through the data layer", () => {
  it("is saved by the personal, read by a linked aluno, removed when turned off", async () => {
    const personal = signedInAs("trainerA");
    await saveMyContact(personal, "trainerA", { name: "Ana Personal", whatsapp: "(11) 99999-0000" });
    expect(await loadTrainerContact(signedInAs("studentA"), "trainerA")).toMatchObject({ name: "Ana Personal", whatsapp: "5511999990000" });
    await removeMyContact(personal, "trainerA");
    expect(await loadTrainerContact(signedInAs("studentA"), "trainerA")).toBeNull();
  });

  it("refuses input the screen should have caught, and is unreadable to other personals' alunos", async () => {
    await expect(saveMyContact(signedInAs("trainerA"), "trainerA", { name: "A", whatsapp: "(11) 99999-0000" })).rejects.toThrow();
    await expect(saveMyContact(signedInAs("trainerA"), "trainerA", { name: "Ana", whatsapp: "123" })).rejects.toThrow();
    await saveMyContact(signedInAs("trainerA"), "trainerA", { name: "Ana", whatsapp: "(11) 99999-0000" });
    await env.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/studentC").set({ role: "STUDENT", trainerId: "trainerB" });
    });
    await expect(loadTrainerContact(signedInAs("studentC"), "trainerA")).rejects.toThrow();
  });
});

describe("a new assessment through the data layer", () => {
  it("lands with the anamnese, its consent and the server's time under the v8 shape", async () => {
    const aluno = signedInAs("studentA");
    await env.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/studentA").update({ pendingAssessmentRequest: true });
    });
    const id = await submitAssessment(
      aluno,
      "studentA",
      "trainerA",
      { heart_condition: false },
      { goal: "Hipertrofia", experienceLevel: "Iniciante", trainingDays: ["Seg"] },
      Date.now(),
      { record: { version: 1, answers: { notes: "ok" } }, consentVersion: "anamnese-v1" },
    );
    expect(id).toEqual(expect.any(String));
  });
});
