import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";
import type { Auth } from "firebase/auth";
import {
  applyEmailAction,
  applyVerification,
  errorCodeOf,
  inspectRecovery,
  previewReset,
  submitNewPassword,
} from "./authAction";

vi.mock("firebase/auth", () => ({
  applyActionCode: vi.fn(async () => undefined),
  checkActionCode: vi.fn(async () => ({ operation: "RECOVER_EMAIL", data: { email: "old@example.com" } })),
  confirmPasswordReset: vi.fn(async () => undefined),
  verifyPasswordResetCode: vi.fn(async () => "ana@example.com"),
  // data/emailVerification.ts imports these two; not used here.
  deleteUser: vi.fn(),
  sendEmailVerification: vi.fn(),
}));

function auth(currentUser: unknown = null): Auth {
  return { currentUser } as Auth;
}

beforeEach(() => vi.clearAllMocks());

describe("applyVerification", () => {
  it("confirms the code, then reloads the signed-in user and forces a new token — in that order", async () => {
    const order: string[] = [];
    vi.mocked(applyActionCode).mockImplementationOnce(async () => void order.push("apply"));
    const user = {
      emailVerified: true,
      reload: vi.fn(async () => void order.push("reload")),
      getIdToken: vi.fn(async () => {
        order.push("token");
        return "t";
      }),
    };
    const a = auth(user);

    await applyVerification(a, "code-1");

    expect(applyActionCode).toHaveBeenCalledWith(a, "code-1");
    expect(order).toEqual(["apply", "reload", "token"]);
    expect(user.getIdToken).toHaveBeenCalledWith(true);
  });

  it("only applies the code when nobody is signed in here (the link opened on another device)", async () => {
    await expect(applyVerification(auth(null), "code-2")).resolves.toBeUndefined();
    expect(applyActionCode).toHaveBeenCalledOnce();
  });

  it("does not report a failed session refresh as a failed link — the address is confirmed by then", async () => {
    const user = {
      emailVerified: true,
      reload: vi.fn(async () => {
        throw new Error("offline");
      }),
      getIdToken: vi.fn(),
    };
    await expect(applyVerification(auth(user), "code-3")).resolves.toBeUndefined();
    expect(user.getIdToken).not.toHaveBeenCalled();
  });

  it("surfaces a spent code and never touches the session then", async () => {
    vi.mocked(applyActionCode).mockRejectedValueOnce(Object.assign(new Error("x"), { code: "auth/invalid-action-code" }));
    const user = { emailVerified: false, reload: vi.fn(), getIdToken: vi.fn() };
    await expect(applyVerification(auth(user), "spent")).rejects.toMatchObject({ code: "auth/invalid-action-code" });
    expect(user.reload).not.toHaveBeenCalled();
  });
});

describe("the other modes", () => {
  it("applyEmailAction applies the code and nothing more", async () => {
    const user = { reload: vi.fn(), getIdToken: vi.fn() };
    const a = auth(user);
    await applyEmailAction(a, "code-4");
    expect(applyActionCode).toHaveBeenCalledWith(a, "code-4");
    expect(user.reload).not.toHaveBeenCalled();
  });

  it("inspectRecovery reads the address to restore without applying the code", async () => {
    await expect(inspectRecovery(auth(), "code-5")).resolves.toBe("old@example.com");
    expect(checkActionCode).toHaveBeenCalledOnce();
    expect(applyActionCode).not.toHaveBeenCalled();
  });

  it("previewReset checks the code and returns the address; submitNewPassword spends it", async () => {
    const a = auth();
    await expect(previewReset(a, "code-6")).resolves.toBe("ana@example.com");
    expect(confirmPasswordReset).not.toHaveBeenCalled();
    await submitNewPassword(a, "code-6", "secret1");
    expect(verifyPasswordResetCode).toHaveBeenCalledWith(a, "code-6");
    expect(confirmPasswordReset).toHaveBeenCalledWith(a, "code-6", "secret1");
  });
});

describe("errorCodeOf", () => {
  it("reads a Firebase-style code and nothing else", () => {
    expect(errorCodeOf({ code: "auth/expired-action-code" })).toBe("auth/expired-action-code");
    expect(errorCodeOf(new Error("plain"))).toBeUndefined();
    expect(errorCodeOf(null)).toBeUndefined();
    expect(errorCodeOf({ code: 42 })).toBeUndefined();
  });
});
