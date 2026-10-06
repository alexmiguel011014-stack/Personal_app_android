import { FirebaseError } from "firebase/app";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./authErrors";
import { normalizeInviteCode } from "./invites";
import { destinationFor, profileFrom, type Profile } from "./session";

describe("profileFrom — AuthRepository.resolveRole", () => {
  it("reads the role uppercased, and a missing document as an unclaimed STUDENT", () => {
    expect(profileFrom({ role: "trainer" })).toEqual({ role: "TRAINER", trainerId: null, accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null });
    expect(profileFrom({ role: "STUDENT", trainerId: "t1" })).toEqual({ role: "STUDENT", trainerId: "t1", accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null });
    expect(profileFrom(undefined)).toEqual({ role: "STUDENT", trainerId: null, accessStatus: "active", platformBillingStatus: null, platformBillingUntil: null });
  });

  it("reads an unknown role as STUDENT, and keeps NONE (Kotlin's enum has it)", () => {
    expect(profileFrom({ role: "coach" }).role).toBe("STUDENT");
    expect(profileFrom({ role: "none" }).role).toBe("NONE");
    expect(profileFrom({ role: "TRAINER", accessStatus: "suspended" }).accessStatus).toBe("suspended");
    expect(profileFrom({ role: "TRAINER", accessStatus: "unknown" }).accessStatus).toBe("active");
    expect(profileFrom({ role: "TRAINER", platformBillingStatus: "pending", platformBillingUntil: 1 }).platformBillingStatus).toBe("pending");
    expect(profileFrom({ role: "TRAINER", platformBillingStatus: "current", platformBillingUntil: "later" }).platformBillingUntil).toBeNull();
  });
});

describe("destinationFor — RoleRouter", () => {
  const signedIn = (profile: Profile) => ({
    status: "signedIn" as const,
    uid: "u",
    email: null,
    emailVerified: true,
    profile,
  });

  it("sends each kind of account to its own area", () => {
    expect(destinationFor({ status: "signedOut" })).toBe("/entrar");
    expect(destinationFor(signedIn(profileFrom({ role: "TRAINER" })))).toBe("/app");
    expect(destinationFor(signedIn(profileFrom({ role: "ADM" })))).toBe("/admin");
    expect(destinationFor(signedIn(profileFrom({ role: "TRAINER", accessStatus: "suspended" })))).toBe("/entrar");
    expect(destinationFor(signedIn(profileFrom({ role: "STUDENT", trainerId: "t1" })))).toBe("/aluno");
    expect(destinationFor(signedIn(profileFrom({ role: "STUDENT", trainerId: null })))).toBe("/convite");
    expect(destinationFor(signedIn(profileFrom({ role: "NONE" })))).toBe("/entrar");
  });

  it("routes an already signed-in trainer to the suspension screen when the live profile changes", () => {
    const current = signedIn(profileFrom({ role: "TRAINER", accessStatus: "active" }));
    const updated = { ...current, profile: profileFrom({ role: "TRAINER", accessStatus: "suspended" }) };
    expect(destinationFor(updated)).toBe("/entrar");
  });
});

describe("invite codes and auth messages", () => {
  it("normalises a code the way the Android field does", () => {
    expect(normalizeInviteCode("  ab12cd34 ")).toBe("AB12CD34");
  });

  it("turns Firebase's error codes into sentences, and anything else into a generic one", () => {
    expect(authErrorMessage(new FirebaseError("auth/invalid-credential", "x"))).toBe("E-mail ou senha incorretos.");
    expect(authErrorMessage(new FirebaseError("auth/weak-password", "x"))).toMatch(/6 caracteres/);
    expect(authErrorMessage(new FirebaseError("auth/something-new", "x"))).toBe("Não foi possível concluir. Tente de novo.");
    expect(authErrorMessage(new Error("boom"))).toBe("Não foi possível concluir. Tente de novo.");
  });

  it("explains the verification-link failures (GOALS.md §27)", () => {
    expect(authErrorMessage(new FirebaseError("auth/unauthorized-continue-uri", "x"))).toMatch(/link de confirmação/);
    expect(authErrorMessage(new FirebaseError("auth/invalid-continue-uri", "x"))).toMatch(/link de confirmação/);
    expect(authErrorMessage(new FirebaseError("auth/requires-recent-login", "x"))).toMatch(/entre de novo/);
  });
});
