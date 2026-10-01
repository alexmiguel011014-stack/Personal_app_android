import { FirebaseError } from "firebase/app";
import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./authErrors";
import { normalizeInviteCode } from "./invites";
import { destinationFor, profileFrom, type Profile } from "./session";

describe("profileFrom — AuthRepository.resolveRole", () => {
  it("reads the role uppercased, and a missing document as an unclaimed STUDENT", () => {
    expect(profileFrom({ role: "trainer" })).toEqual({ role: "TRAINER", trainerId: null });
    expect(profileFrom({ role: "STUDENT", trainerId: "t1" })).toEqual({ role: "STUDENT", trainerId: "t1" });
    expect(profileFrom(undefined)).toEqual({ role: "STUDENT", trainerId: null });
  });

  it("reads an unknown role as STUDENT, and keeps NONE (Kotlin's enum has it)", () => {
    expect(profileFrom({ role: "coach" }).role).toBe("STUDENT");
    expect(profileFrom({ role: "none" }).role).toBe("NONE");
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
    expect(destinationFor(signedIn({ role: "TRAINER", trainerId: null }))).toBe("/app");
    expect(destinationFor(signedIn({ role: "ADM", trainerId: null }))).toBe("/app");
    expect(destinationFor(signedIn({ role: "STUDENT", trainerId: "t1" }))).toBe("/aluno");
    expect(destinationFor(signedIn({ role: "STUDENT", trainerId: null }))).toBe("/convite");
    expect(destinationFor(signedIn({ role: "NONE", trainerId: null }))).toBe("/entrar");
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
