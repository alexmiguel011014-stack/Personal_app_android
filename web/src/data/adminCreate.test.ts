import { describe, expect, it } from "vitest";
import { createInitialPassword } from "./adminCreate";

describe("createInitialPassword", () => {
  it("creates a 20-character credential using only URL-safe characters", () => {
    const cryptoApi = {
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).fill(63);
        return array;
      },
    } as Crypto;

    const password = createInitialPassword(20, cryptoApi);
    expect(password).toHaveLength(20);
    expect(password).toBe("_".repeat(20));
    expect(password).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects an invalid length", () => {
    expect(() => createInitialPassword(0)).toThrow(RangeError);
  });
});
