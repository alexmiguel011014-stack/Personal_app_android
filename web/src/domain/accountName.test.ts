import { describe, expect, it } from "vitest";
import { canChangeName, daysUntilNameChange, MAX_NAME_LENGTH, NAME_CHANGE_INTERVAL_DAYS, nextNameChangeAt, normalizeAccountName } from "./accountName";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 6, 12, 0, 0);

describe("normalizeAccountName", () => {
  it("trims and collapses inner whitespace", () => {
    expect(normalizeAccountName("  Maria   da  Silva \n")).toBe("Maria da Silva");
  });

  it("keeps accents and other letters as typed", () => {
    expect(normalizeAccountName("José Ângelo Çalışkan")).toBe("José Ângelo Çalışkan");
  });

  it("refuses names that are too short or too long", () => {
    expect(() => normalizeAccountName("  A ")).toThrow(/pelo menos 2/);
    expect(() => normalizeAccountName("")).toThrow(/pelo menos 2/);
    expect(normalizeAccountName("Al")).toBe("Al");
    expect(normalizeAccountName("x".repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
    expect(() => normalizeAccountName("x".repeat(MAX_NAME_LENGTH + 1))).toThrow(/no máximo 80/);
  });

  it("refuses control characters that survive whitespace collapsing", () => {
    expect(() => normalizeAccountName("Ana\u0007Costa")).toThrow(/controle/);
    expect(() => normalizeAccountName("Ana\u007fCosta")).toThrow(/controle/);
  });
});

describe("the 60-day interval", () => {
  it("is 60 days", () => {
    expect(NAME_CHANGE_INTERVAL_DAYS).toBe(60);
  });

  it("allows the first change at any time", () => {
    expect(nextNameChangeAt(null)).toBeNull();
    expect(canChangeName(null, T0)).toBe(true);
    expect(daysUntilNameChange(null, T0)).toBe(0);
  });

  it("blocks until exactly 60 days after the last change", () => {
    expect(nextNameChangeAt(T0)).toBe(T0 + 60 * DAY);
    expect(canChangeName(T0, T0 + 59 * DAY + 86_399_999)).toBe(false);
    expect(canChangeName(T0, T0 + 60 * DAY - 1)).toBe(false);
    expect(canChangeName(T0, T0 + 60 * DAY)).toBe(true);
    expect(canChangeName(T0, T0 + 400 * DAY)).toBe(true);
  });

  it("counts whole days left, rounding up", () => {
    expect(daysUntilNameChange(T0, T0)).toBe(60);
    expect(daysUntilNameChange(T0, T0 + 1)).toBe(60);
    expect(daysUntilNameChange(T0, T0 + 59 * DAY + 1)).toBe(1);
    expect(daysUntilNameChange(T0, T0 + 60 * DAY)).toBe(0);
  });

  it("never counts from before the stamp, whatever the device's clock says", () => {
    expect(daysUntilNameChange(T0, T0 - 5_000)).toBe(60);
    expect(daysUntilNameChange(T0, T0 - 3 * DAY)).toBe(60);
  });
});
