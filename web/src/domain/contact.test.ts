import { describe, expect, it } from "vitest";
import { brazilianNumber, telLink, whatsappLink } from "./contact";

describe("brazilianNumber", () => {
  it.each([
    ["(11) 99999-0000", "5511999990000"],
    ["11999990000", "5511999990000"],
    ["+55 11 99999 0000", "5511999990000"],
    ["5511999990000", "5511999990000"],
    ["011 99999-0000", "5511999990000"],
    ["0 11 3333-4444", "551133334444"],
    ["(11) 3333-4444", "551133334444"],
    ["+55 (11) 3333-4444", "551133334444"],
    ["0055 11 99999-0000", "5511999990000"],
    // DDD 55 (Rio Grande do Sul) is not mistaken for the country code
    ["55 99999-0000", "5555999990000"],
    ["+55 55 99999-0000", "5555999990000"],
  ])("reads %s", (typed, expected) => {
    expect(brazilianNumber(typed)).toBe(expected);
  });

  it.each([
    [""],
    ["abc"],
    ["99999-0000"], // no DDD
    ["(00) 99999-0000"], // no such DDD
    ["(10) 99999-0000"],
    ["(11) 89999-0000"], // nine digits that do not start with 9
    ["(11) 9999-000"], // too short
    ["+1 415 555 0100"], // not Brazilian
    ["551199999000012"], // too long
  ])("rejects %s", (typed) => {
    expect(brazilianNumber(typed)).toBeNull();
  });
});

describe("whatsappLink / telLink", () => {
  it("builds a wa.me link, with an encoded message when there is one", () => {
    expect(whatsappLink("(11) 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappLink("(11) 99999-0000", "")).toBe("https://wa.me/5511999990000");
    expect(whatsappLink("(11) 99999-0000", "Oi, Ana! Veja: https://site/aluno/?a=1&b=2")).toBe(
      "https://wa.me/5511999990000?text=Oi%2C%20Ana!%20Veja%3A%20https%3A%2F%2Fsite%2Faluno%2F%3Fa%3D1%26b%3D2",
    );
  });

  it("builds a tel: link with the country code", () => {
    expect(telLink("11 99999-0000")).toBe("tel:+5511999990000");
  });

  it("gives null — no link at all — for a number it cannot read", () => {
    expect(whatsappLink("123")).toBeNull();
    expect(telLink("")).toBeNull();
  });
});
