import { describe, expect, it } from "vitest";
import { isOneEditAway, suggestDomain, validateEmail } from "./emailPolicy";

describe("validateEmail — accepts real-looking addresses", () => {
  it.each([
    ["ana@gmail.com", "ana@gmail.com"],
    ["  ana@gmail.com  ", "ana@gmail.com"],
    ["Ana.Souza@Gmail.COM", "Ana.Souza@gmail.com"],
    ["ana+treino@gmail.com", "ana+treino@gmail.com"],
    ["joao_silva-1@empresa.com.br", "joao_silva-1@empresa.com.br"],
    ["a@mail.sub.dominio.org", "a@mail.sub.dominio.org"],
    ["user@xn--exmplo-qta.com", "user@xn--exmplo-qta.com"],
    ["treinador@teste.dev", "treinador@teste.dev"],
    [`${"a".repeat(64)}@gmail.com`, `${"a".repeat(64)}@gmail.com`],
  ])("%s", (input, email) => {
    expect(validateEmail(input)).toEqual({ ok: true, email });
  });
});

describe("validateEmail — refuses what cannot be an address", () => {
  it("asks for the address when it is empty", () => {
    expect(validateEmail("   ")).toMatchObject({ ok: false, reason: "empty" });
  });

  it.each([
    "a@b",
    "a@b.c",
    "@gmail.com",
    "ana@",
    "ana@.com",
    "ana@com",
    "ana gmail.com",
    "ana@gmail..com",
    "ana@@gmail.com",
    "ana@x@gmail.com",
    "an a@gmail.com",
    ".ana@gmail.com",
    "ana.@gmail.com",
    "an..a@gmail.com",
    "ana@-gmail.com",
    "ana@gmail-.com",
    "ana@gmail.c0m",
    '"ana"@gmail.com',
    "ana(comentário)@gmail.com",
    "joão@gmail.com",
    "ana@exemplo.com.",
    `${"a".repeat(65)}@gmail.com`,
    `ana@${"a".repeat(250)}.com`,
  ])("%s", (input) => {
    expect(validateEmail(input)).toMatchObject({ ok: false, reason: "syntax" });
  });
});

describe("validateEmail — throwaway inboxes", () => {
  it.each(["x@mailinator.com", "x@YOPMAIL.com", "x@eu.mailinator.com", "x@guerrillamail.net"])("%s", (input) => {
    expect(validateEmail(input)).toMatchObject({ ok: false, reason: "disposable" });
  });

  it("does not flag a real domain that only contains a listed name", () => {
    expect(validateEmail("x@notmailinator.com")).toEqual({ ok: true, email: "x@notmailinator.com" });
    expect(validateEmail("x@mailinator.com.br")).toEqual({ ok: true, email: "x@mailinator.com.br" });
  });
});

describe("validateEmail — typo hints, never corrections", () => {
  it.each([
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gmai.com", "ana@gmail.com"],
    ["ana@gmaill.com", "ana@gmail.com"],
    ["ana@gnail.com", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["ana@gmial.con", "ana@gmail.com"],
    ["ana@hotmial.com", "ana@hotmail.com"],
    ["ana@hotnail.com", "ana@hotmail.com"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@yaho.com.br", "ana@yahoo.com.br"],
    ["ana@yahoooo.com", null],
    ["ana@empresa.con", "ana@empresa.com"],
    ["ana@empresa.combr", "ana@empresa.com.br"],
    ["ana@uol.con.br", "ana@uol.com.br"],
    ["ana@icluod.com", "ana@icloud.com"],
  ])("%s → %s", (input, suggestion) => {
    const check = validateEmail(input);
    expect(check.ok).toBe(true);
    expect(check.ok && check.suggestion).toBe(suggestion ?? undefined);
  });

  it.each(["gmail.com", "hotmail.com", "uol.com.br", "bol.com.br", "mail.com", "email.com", "ymail.com", "empresa.com.br"])(
    "leaves %s alone",
    (domain) => {
      expect(suggestDomain(domain)).toBeNull();
    },
  );
});

describe("isOneEditAway", () => {
  it.each([
    ["gmail.com", "gmial.com", true],
    ["gmail.com", "gmai.com", true],
    ["gmail.com", "gmaill.com", true],
    ["gmail.com", "gnail.com", true],
    ["gmail.com", "gmail.com", false],
    ["gmail.com", "gmali.cmo", false],
    ["gmail.com", "hotmail.com", false],
    ["ab", "ba", true],
    ["abc", "ca", false],
  ])("%s / %s → %s", (a, b, expected) => {
    expect(isOneEditAway(a, b)).toBe(expected);
    expect(isOneEditAway(b, a)).toBe(expected);
  });
});
