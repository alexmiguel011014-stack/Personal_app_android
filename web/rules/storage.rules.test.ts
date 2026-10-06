import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initializeTestEnvironment, type RulesTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

const projectId = "demo-personal-tracker";
const rulesPath = fileURLToPath(new URL("../../storage.rules", import.meta.url));
const validPng = new Uint8Array([137, 80, 78, 71]);
let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    storage: {
      host: process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":")[0] ?? "127.0.0.1",
      port: Number(process.env.FIREBASE_STORAGE_EMULATOR_HOST?.split(":")[1] ?? 9199),
      rules: readFileSync(rulesPath, "utf8"),
    },
  });
});

afterAll(async () => { await env.cleanup(); });

describe("private account avatar Storage rules", () => {
  it("allows the owner to upload, read, replace, and remove an avatar", async () => {
    const avatar = ref(env.authenticatedContext("owner").storage(), "account-avatars/owner/profile");
    await assertSucceeds(uploadBytes(avatar, validPng, { contentType: "image/png" }));
    await expect(assertSucceeds(getBytes(avatar)).then((bytes) => Array.from(new Uint8Array(bytes))))
      .resolves.toEqual(Array.from(validPng));
    await assertSucceeds(uploadBytes(avatar, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await assertSucceeds(deleteObject(avatar));
  });

  it("denies anonymous and cross-account reads and writes", async () => {
    const ownerAvatar = ref(env.authenticatedContext("owner").storage(), "account-avatars/owner/profile");
    const otherAvatar = ref(env.authenticatedContext("other").storage(), "account-avatars/owner/profile");
    const anonymousAvatar = ref(env.unauthenticatedContext().storage(), "account-avatars/owner/profile");
    await assertSucceeds(uploadBytes(ownerAvatar, validPng, { contentType: "image/png" }));
    await assertFails(getBytes(otherAvatar));
    await assertFails(deleteObject(otherAvatar));
    await assertFails(getBytes(anonymousAvatar));
    await assertFails(uploadBytes(anonymousAvatar, validPng, { contentType: "image/png" }));
  });

  it("denies unsupported MIME types and files larger than 2 MB", async () => {
    const avatar = ref(env.authenticatedContext("owner-invalid").storage(), "account-avatars/owner-invalid/profile");
    await assertFails(uploadBytes(avatar, validPng, { contentType: "image/gif" }));
    await assertFails(uploadBytes(avatar, new Uint8Array(2 * 1024 * 1024 + 1), { contentType: "image/png" }));
  });
});
