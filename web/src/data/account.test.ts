import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accountEmailChangeContinueUrl,
  changeAccountPassword,
  formatPersonalPhone,
  normalizePersonalPhone,
  requestAccountEmailChange,
  syncVerifiedAccountEmail,
} from "./account";
import { EmailAuthProvider, getIdToken, reauthenticateWithCredential, reload, updatePassword, verifyBeforeUpdateEmail } from "firebase/auth";
import type { User } from "firebase/auth";
import { updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: vi.fn((email: string, password: string) => ({ email, password })) },
  getIdToken: vi.fn(async () => "fresh-token"),
  reauthenticateWithCredential: vi.fn(async () => ({ user: {} })),
  reload: vi.fn(async () => undefined),
  updatePassword: vi.fn(async () => undefined),
  verifyBeforeUpdateEmail: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...parts: string[]) => parts.join("/")),
  getDoc: vi.fn(),
  updateDoc: vi.fn(async () => undefined),
}));

function user(overrides: Partial<User> = {}): User {
  return { uid: "u-1", email: "old@example.com", emailVerified: true, ...overrides } as User;
}

beforeEach(() => vi.clearAllMocks());

describe("personal account phone", () => {
  it("normalizes Brazilian numbers with or without the country prefix", () => {
    expect(normalizePersonalPhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePersonalPhone("55 11 3456-7890")).toBe("+551134567890");
  });

  it("accepts valid international E.164 numbers and empty values", () => {
    expect(normalizePersonalPhone("+1 (202) 555-0123")).toBe("+12025550123");
    expect(normalizePersonalPhone("  ")).toBe("");
  });

  it("rejects incomplete and overlong numbers", () => {
    expect(() => normalizePersonalPhone("99999-1234")).toThrow();
    expect(() => normalizePersonalPhone("+123")).toThrow();
    expect(() => normalizePersonalPhone("1".repeat(41))).toThrow();
  });

  it("formats Brazilian numbers for display", () => {
    expect(formatPersonalPhone("+5511987654321")).toBe("+55 (11) 98765-4321");
  });
});

describe("personal account security", () => {
  it("keeps the email action return on the current site and preserves the deployment base path", () => {
    expect(accountEmailChangeContinueUrl(
      "https://example.github.io",
      "/Personal_app_android/admin/conta/",
      "/Personal_app_android/",
    )).toBe("https://example.github.io/Personal_app_android/admin/conta/?accountEmailChange=confirmed");
    expect(accountEmailChangeContinueUrl("http://localhost:3000", "/app/conta/", ""))
      .toBe("http://localhost:3000/app/conta/?accountEmailChange=confirmed");
  });

  it("reauthenticates with the current password before sending a verified email change", async () => {
    const currentUser = user();
    const continueUrl = "https://example.test/app/conta/?accountEmailChange=confirmed";
    await expect(requestAccountEmailChange(currentUser, " next@example.com ", " exact pass ", continueUrl))
      .resolves.toBe("next@example.com");
    expect(EmailAuthProvider.credential).toHaveBeenCalledWith("old@example.com", " exact pass ");
    expect(reauthenticateWithCredential).toHaveBeenCalledWith(currentUser, { email: "old@example.com", password: " exact pass " });
    expect(verifyBeforeUpdateEmail).toHaveBeenCalledWith(currentUser, "next@example.com", { url: continueUrl });
    expect(vi.mocked(reauthenticateWithCredential).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(verifyBeforeUpdateEmail).mock.invocationCallOrder[0]);
  });

  it("requires matching new-password confirmation and reauthenticates before changing it", async () => {
    const currentUser = user();
    await expect(changeAccountPassword(currentUser, "current", "new-secret", "different"))
      .rejects.toMatchObject({ code: "account/password-confirmation" });
    expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    expect(updatePassword).not.toHaveBeenCalled();

    await changeAccountPassword(currentUser, "current", "new-secret", "new-secret");
    expect(reauthenticateWithCredential).toHaveBeenCalledOnce();
    expect(updatePassword).toHaveBeenCalledWith(currentUser, "new-secret");
    expect(vi.mocked(reauthenticateWithCredential).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(updatePassword).mock.invocationCallOrder[0]);
  });

  it("refreshes Auth and its ID token before mirroring only a verified address", async () => {
    const currentUser = user({ email: "new@example.com" });
    await expect(syncVerifiedAccountEmail({} as Firestore, currentUser, "new@example.com")).resolves.toBe("new@example.com");
    expect(reload).toHaveBeenCalledWith(currentUser);
    expect(getIdToken).toHaveBeenCalledWith(currentUser, true);
    expect(updateDoc).toHaveBeenCalledWith("users/u-1", { email: "new@example.com" });
    expect(vi.mocked(reload).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(getIdToken).mock.invocationCallOrder[0]);
    expect(vi.mocked(getIdToken).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(updateDoc).mock.invocationCallOrder[0]);
  });

  it("does not mirror an unverified or different email address", async () => {
    await expect(syncVerifiedAccountEmail({} as Firestore, user({ emailVerified: false }), "new@example.com"))
      .rejects.toMatchObject({ code: "account/email-not-verified" });
    await expect(syncVerifiedAccountEmail({} as Firestore, user(), "new@example.com"))
      .rejects.toMatchObject({ code: "account/email-change-pending" });
    expect(updateDoc).not.toHaveBeenCalled();
  });
});
