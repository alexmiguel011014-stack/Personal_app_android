import { describe, expect, it } from "vitest";
import { verificationContinueUrl } from "./emailVerification";
import {
  actionErrorMessage,
  isSpentCode,
  newPasswordProblem,
  parseActionLink,
  safeContinueUrl,
} from "./authAction";

const SITE = "https://alexmiguel011014-stack.github.io";
const BASE = "/Personal_app_android";

describe("parseActionLink", () => {
  it("reads what Firebase appends", () => {
    expect(
      parseActionLink("?mode=verifyEmail&oobCode=abc123&apiKey=k&continueUrl=https%3A%2F%2Fsite%2Fconvite%2F&lang=pt-BR"),
    ).toEqual({ mode: "verifyEmail", oobCode: "abc123", continueUrl: "https://site/convite/", lang: "pt-BR" });
  });

  it("knows the four modes and nothing else", () => {
    for (const mode of ["verifyEmail", "resetPassword", "recoverEmail", "verifyAndChangeEmail"]) {
      expect(parseActionLink(`?mode=${mode}&oobCode=x`).mode).toBe(mode);
    }
    expect(parseActionLink("?mode=signIn&oobCode=x").mode).toBeNull();
    expect(parseActionLink("?mode=VERIFYEMAIL&oobCode=x").mode).toBeNull();
    expect(parseActionLink("").mode).toBeNull();
  });

  it("treats a blank value as missing and accepts URLSearchParams too", () => {
    expect(parseActionLink("?mode=verifyEmail&oobCode=%20%20")).toMatchObject({ oobCode: null, continueUrl: null, lang: null });
    expect(parseActionLink(new URLSearchParams({ mode: "resetPassword", oobCode: "z" }))).toMatchObject({
      mode: "resetPassword",
      oobCode: "z",
    });
  });
});

describe("safeContinueUrl", () => {
  it("lets the site's own invite page through, query kept", () => {
    const invite = verificationContinueUrl(SITE, BASE, "AB12CD34");
    expect(safeContinueUrl(invite, SITE, BASE)).toBe(invite);
    const change = `${SITE}${BASE}/app/conta/?accountEmailChange=confirmed`;
    expect(safeContinueUrl(change, SITE, BASE)).toBe(change);
  });

  it("works with no base path (local dev, a root-hosted domain)", () => {
    expect(safeContinueUrl("http://localhost:3000/convite/?c=AB", "http://localhost:3000", "")).toBe(
      "http://localhost:3000/convite/?c=AB",
    );
  });

  it("rejects another host, a lookalike host and a subdomain", () => {
    expect(safeContinueUrl("https://evil.example/", SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`${SITE}.evil.example${BASE}/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`https://x.${SITE.slice(8)}${BASE}/`, SITE, BASE)).toBeNull();
  });

  it("rejects dangerous schemes and scheme-relative or relative values", () => {
    expect(safeContinueUrl("javascript:alert(1)", SITE, BASE)).toBeNull();
    expect(safeContinueUrl("data:text/html,<p>x</p>", SITE, BASE)).toBeNull();
    expect(safeContinueUrl("//evil.example/x", SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`${BASE}/convite/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl("https:\\\\evil.example\\x", SITE, BASE)).toBeNull();
  });

  it("rejects a different port, a different scheme and user-info that hides the real host", () => {
    expect(safeContinueUrl("http://localhost:3001/convite/", "http://localhost:3000", "")).toBeNull();
    expect(safeContinueUrl(`http://${SITE.slice(8)}${BASE}/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`https://${SITE.slice(8)}@evil.example${BASE}/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`https://user:pw@${SITE.slice(8)}${BASE}/`, SITE, BASE)).toBeNull();
  });

  it("rejects a path that leaves the base path, however it is spelt", () => {
    expect(safeContinueUrl(`${SITE}${BASE}/../elsewhere/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`${SITE}${BASE}/%2e%2e/elsewhere/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`${SITE}/Personal_app_android_other/`, SITE, BASE)).toBeNull();
    expect(safeContinueUrl(`${SITE}/`, SITE, BASE)).toBeNull();
  });

  it("returns null for a missing or blank value", () => {
    expect(safeContinueUrl(null, SITE, BASE)).toBeNull();
    expect(safeContinueUrl("  ", SITE, BASE)).toBeNull();
  });
});

describe("actionErrorMessage", () => {
  it("says what to do for a spent or expired code, per mode", () => {
    expect(actionErrorMessage("auth/expired-action-code", "verifyEmail")).toContain("Reenviar e-mail");
    expect(actionErrorMessage("auth/invalid-action-code", "resetPassword")).toContain("Esqueci minha senha");
    expect(actionErrorMessage("auth/invalid-action-code", "verifyAndChangeEmail")).toContain("Minha conta");
    expect(actionErrorMessage("auth/invalid-action-code", null)).toBe("Este link já foi usado ou expirou.");
  });

  it("explains the other failures and falls back to a generic line", () => {
    expect(actionErrorMessage("auth/user-disabled", "resetPassword")).toBe("Esta conta foi desativada.");
    expect(actionErrorMessage("auth/network-request-failed", "verifyEmail")).toContain("conexão");
    expect(actionErrorMessage("auth/weak-password", "resetPassword")).toContain("6 caracteres");
    expect(actionErrorMessage(undefined, "verifyEmail")).toBe("Não foi possível concluir. Tente de novo.");
  });

  it("tells a spent code from other errors", () => {
    expect(isSpentCode("auth/expired-action-code")).toBe(true);
    expect(isSpentCode("auth/invalid-action-code")).toBe(true);
    expect(isSpentCode("auth/network-request-failed")).toBe(false);
    expect(isSpentCode(undefined)).toBe(false);
  });
});

describe("newPasswordProblem", () => {
  it("accepts a long enough password that matches its confirmation", () => {
    expect(newPasswordProblem("secret1", "secret1")).toBeNull();
  });

  it("names the first problem", () => {
    expect(newPasswordProblem("", "")).toBe("Digite a nova senha.");
    expect(newPasswordProblem("abc", "abc")).toContain("pelo menos 6");
    expect(newPasswordProblem("secret1", "secret2")).toContain("diferentes");
  });
});
