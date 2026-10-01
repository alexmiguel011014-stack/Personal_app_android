import { describe, expect, it } from "vitest";
import { confirmVerified, type VerifiableUser } from "./emailVerification";

/** A user whose address gets confirmed elsewhere: `reload` is what makes the change visible here. */
function fakeUser(verifiedOnServer: boolean, calls: string[] = []): VerifiableUser {
  let verified = false;
  return {
    get emailVerified() {
      return verified;
    },
    async reload() {
      calls.push("reload");
      verified = verifiedOnServer;
    },
    async getIdToken(forceRefresh?: boolean) {
      calls.push(`getIdToken(${String(forceRefresh)})`);
      return "token";
    },
  };
}

describe("confirmVerified", () => {
  it("reloads, then forces a new token — in that order — once the address is confirmed", async () => {
    const calls: string[] = [];
    await expect(confirmVerified(fakeUser(true, calls))).resolves.toBe(true);
    expect(calls).toEqual(["reload", "getIdToken(true)"]);
  });

  it("does not refresh the token while the address is still unconfirmed", async () => {
    const calls: string[] = [];
    await expect(confirmVerified(fakeUser(false, calls))).resolves.toBe(false);
    expect(calls).toEqual(["reload"]);
  });

  it("lets a network failure through, for the page to report", async () => {
    const user = { ...fakeUser(true), reload: () => Promise.reject(new Error("offline")) };
    await expect(confirmVerified(user)).rejects.toThrow("offline");
  });
});
