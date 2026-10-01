import { describe, expect, it } from "vitest";
import { emailSuggestionToConfirm } from "./adminEmailSuggestion";

describe("emailSuggestionToConfirm", () => {
  it("requires confirmation until the typed address is explicitly kept", () => {
    expect(emailSuggestionToConfirm("ana@gmial.com", "ana@gmail.com", null)).toBe("ana@gmail.com");
    expect(emailSuggestionToConfirm("ana@gmial.com", "ana@gmail.com", "ana@gmial.com")).toBeNull();
  });

  it("does not offer a suggestion when validation has none", () => {
    expect(emailSuggestionToConfirm("ana@gmail.com", undefined, null)).toBeNull();
  });
});
