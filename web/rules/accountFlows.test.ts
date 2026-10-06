import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { doc, getDoc, updateDoc, type Firestore } from "firebase/firestore";
import { getBytes, ref, type FirebaseStorage } from "firebase/storage";
import { accountAvatarPath, loadAccountAvatarObjectUrl, removeAccountAvatar, saveAccountAvatarPath, uploadAccountAvatar } from "../src/data/accountAvatar";
import { loadPersonalAccount, savePersonalName, savePersonalPhone } from "../src/data/account";

const PROJECT_ID = "demo-personal-tracker";
const USERS = {
  adminA: { role: "ADM", phone: "+5511911112222", email: "admin@example.test" },
  trainerA: { role: "TRAINER", phone: "+5521988887777", email: "trainer@example.test" },
  trainerB: { role: "TRAINER", phone: "", email: "other-trainer@example.test" },
  studentA: { role: "STUDENT", trainerId: "trainerA", phone: "", email: "student@example.test" },
} satisfies Record<string, Record<string, unknown>>;
const PHONE_TO_SAVE = "11 99999-0000";
const NORMALIZED_PHONE = "+5511999990000";
const FORMATTED_PHONE = "+55 (11) 99999-0000";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(fileURLToPath(new URL("../../firestore.rules", import.meta.url)), "utf8") },
    storage: {
      host: process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":")[0] ?? "127.0.0.1",
      port: Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":")[1] ?? 9199),
      rules: readFileSync(fileURLToPath(new URL("../../storage.rules", import.meta.url)), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await Promise.all([env.clearFirestore(), env.clearStorage()]);
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries(USERS).map(([uid, data]) => db.doc(`users/${uid}`).set(data)));
  });
});

function signedIn(uid: string): { db: Firestore; storage: FirebaseStorage } {
  const context = env.authenticatedContext(uid, { email_verified: true });
  // rules-unit-testing returns compat wrappers; the modular Firebase APIs used by the app unwrap them.
  return {
    db: context.firestore() as unknown as Firestore,
    storage: context.storage() as unknown as FirebaseStorage,
  };
}

describe("account phone data flows", () => {
  it.each([
    ["ADM", "adminA", "+55 (11) 91111-2222", undefined],
    ["trainer", "trainerA", "+55 (21) 98888-7777", undefined],
    ["student", "studentA", "", "trainerA"],
  ])("loads, normalizes, saves, and clears the %s account phone", async (_role, uid, initialPhone, trainerId) => {
    const { db } = signedIn(uid);

    await expect(assertSucceeds(loadPersonalAccount(db, uid))).resolves.toEqual({
      phone: initialPhone,
      email: USERS[uid as keyof typeof USERS].email,
      name: "",
      nameChangedAt: null,
    });
    await expect(assertSucceeds(savePersonalPhone(db, uid, PHONE_TO_SAVE))).resolves.toBe(FORMATTED_PHONE);

    let profile = await getDoc(doc(db, "users", uid));
    expect(profile.get("phone")).toBe(NORMALIZED_PHONE);
    expect(profile.get("role")).toBe(USERS[uid as keyof typeof USERS].role);
    expect(profile.get("trainerId")).toBe(trainerId);

    await expect(assertSucceeds(savePersonalPhone(db, uid, ""))).resolves.toBe("");
    profile = await getDoc(doc(db, "users", uid));
    expect(profile.get("phone")).toBe("");
    expect(profile.get("role")).toBe(USERS[uid as keyof typeof USERS].role);
    expect(profile.get("trainerId")).toBe(trainerId);
  });

  it("denies cross-UID reads and phone writes through the account data functions", async () => {
    const { db } = signedIn("trainerB");
    await assertFails(loadPersonalAccount(db, "trainerA"));
    await assertFails(savePersonalPhone(db, "trainerA", PHONE_TO_SAVE));
  });

  it("does not expose or mutate role and trainer ownership through the account functions", async () => {
    const { db } = signedIn("studentA");
    expect(await assertSucceeds(loadPersonalAccount(db, "studentA"))).toEqual({ phone: "", email: "student@example.test", name: "", nameChangedAt: null });
    await assertSucceeds(savePersonalPhone(db, "studentA", PHONE_TO_SAVE));

    const profileRef = doc(db, "users", "studentA");
    await assertFails(updateDoc(profileRef, { role: "TRAINER" }));
    await assertFails(updateDoc(profileRef, { trainerId: "trainerB" }));
    const profile = await getDoc(profileRef);
    expect(profile.get("role")).toBe("STUDENT");
    expect(profile.get("trainerId")).toBe("trainerA");
    expect(profile.get("phone")).toBe(NORMALIZED_PHONE);
  });
});

describe("account avatar data flows", () => {
  const originalBytes = new Uint8Array([137, 80, 78, 71, 1]);
  const replacementBytes = new Uint8Array([137, 80, 78, 71, 2]);

  function png(bytes: Uint8Array): File {
    const blobBytes = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBytes).set(bytes);
    return new File([blobBytes], "avatar.png", { type: "image/png" });
  }

  async function readObjectUrl(url: string | null): Promise<number[] | null> {
    if (!url) return null;
    try {
      const response = await fetch(url);
      expect(response.status).toBe(200);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  it("lets the owner upload, read, replace, and remove their private avatar", async () => {
    const { db, storage } = signedIn("trainerA");
    const path = accountAvatarPath("trainerA");

    await assertSucceeds(uploadAccountAvatar(storage, "trainerA", png(originalBytes)));
    await assertSucceeds(saveAccountAvatarPath(db, "trainerA", path));
    await expect(readObjectUrl(await loadAccountAvatarObjectUrl(storage, db, "trainerA")))
      .resolves.toEqual(Array.from(originalBytes));

    await assertSucceeds(uploadAccountAvatar(storage, "trainerA", png(replacementBytes)));
    await expect(readObjectUrl(await loadAccountAvatarObjectUrl(storage, db, "trainerA")))
      .resolves.toEqual(Array.from(replacementBytes));

    await assertSucceeds(removeAccountAvatar(storage, "trainerA"));
    await expect(loadAccountAvatarObjectUrl(storage, db, "trainerA")).resolves.toBeNull();
    await assertSucceeds(saveAccountAvatarPath(db, "trainerA", null));
    expect((await getDoc(doc(db, "users", "trainerA"))).get("avatarStoragePath")).toBeNull();
  });

  it("denies another UID from reading, uploading, or removing the owner's avatar", async () => {
    const owner = signedIn("trainerA");
    const other = signedIn("trainerB");
    const path = accountAvatarPath("trainerA");
    await assertSucceeds(uploadAccountAvatar(owner.storage, "trainerA", png(originalBytes)));

    await assertFails(getBytes(ref(other.storage, path)));
    await assertFails(uploadAccountAvatar(other.storage, "trainerA", png(replacementBytes)));
    await assertFails(removeAccountAvatar(other.storage, "trainerA"));
  });
});

// GOALS.md §29g, rules v5: a user may correct their own name once every 60 days, stamped with the server's clock.
describe("account name data flow", () => {
  const DAY = 86_400_000;

  it("renames once, shows the stamp, and holds a second rename for 60 days", async () => {
    const { db } = signedIn("studentA");
    const before = Date.now();
    const first = await savePersonalName(db, "studentA", "  Ana   Maria Costa ");
    expect(first.name).toBe("Ana Maria Costa");
    expect(first.nameChangedAt).not.toBeNull();
    expect(Math.abs((first.nameChangedAt ?? 0) - before)).toBeLessThan(60_000);

    const account = await loadPersonalAccount(db, "studentA");
    expect(account.name).toBe("Ana Maria Costa");
    expect(account.nameChangedAt).toBe(first.nameChangedAt);

    await assertFails(savePersonalName(db, "studentA", "Outro Nome"));
    expect((await loadPersonalAccount(db, "studentA")).name).toBe("Ana Maria Costa");
  });

  it("allows the next rename once 60 days have passed", async () => {
    const { db } = signedIn("trainerA");
    await savePersonalName(db, "trainerA", "Primeiro Nome");
    await env.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc("users/trainerA").update({ nameChangedAt: new Date(Date.now() - 61 * DAY) });
    });
    const second = await savePersonalName(db, "trainerA", "Segundo Nome");
    expect(second.name).toBe("Segundo Nome");
    expect((second.nameChangedAt ?? 0) - Date.now()).toBeGreaterThan(-60_000);
  });

  it("works for the ADM too, and refuses an unacceptable name before writing anything", async () => {
    const { db } = signedIn("adminA");
    await expect(savePersonalName(db, "adminA", " A ")).rejects.toThrow(/pelo menos 2/);
    expect((await loadPersonalAccount(db, "adminA")).nameChangedAt).toBeNull();
    await expect(savePersonalName(db, "adminA", "Administrador Geral")).resolves.toMatchObject({ name: "Administrador Geral" });
  });

  it("does not let another account change the name", async () => {
    await assertFails(savePersonalName(signedIn("trainerB").db, "studentA", "Intruso"));
  });
});
