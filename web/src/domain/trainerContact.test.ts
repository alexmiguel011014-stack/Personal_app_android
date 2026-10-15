import { describe, expect, it } from "vitest";
import { checkContactInput, contactFirstName } from "./trainerContact";

describe("trainerContact", () => {
  it("accepts a name and a Brazilian number and stores the digits with the country code", () => {
    expect(checkContactInput({ name: "  Ana Paula ", whatsapp: "(11) 99999-0000" })).toEqual({ ok: true, name: "Ana Paula", whatsapp: "5511999990000" });
  });
  it("refuses a short or long name and a number that is not Brazilian", () => {
    expect(checkContactInput({ name: "A", whatsapp: "11999990000" })).toEqual({ ok: false, problem: "name" });
    expect(checkContactInput({ name: "x".repeat(81), whatsapp: "11999990000" })).toEqual({ ok: false, problem: "name" });
    expect(checkContactInput({ name: "Ana", whatsapp: "12345" })).toEqual({ ok: false, problem: "whatsapp" });
  });
  it("takes the first name", () => {
    expect(contactFirstName({ name: "Ana Paula Souza" })).toBe("Ana");
  });
});
