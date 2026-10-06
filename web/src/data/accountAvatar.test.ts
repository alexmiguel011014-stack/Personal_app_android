import { describe, expect, it } from "vitest";
import { accountAvatarPath, validateAccountAvatar } from "./accountAvatar";

describe("account avatars", () => {
  it("uses a stable UID-scoped private object path", () => {
    expect(accountAvatarPath("user-123")).toBe("account-avatars/user-123/profile");
  });

  it("accepts small JPG, PNG, and WebP images", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateAccountAvatar({ type, size: 1024 })).toBeNull();
    }
  });

  it("rejects unsupported types, empty images, and files above 2 MB", () => {
    expect(validateAccountAvatar({ type: "image/gif", size: 1024 })).toContain("JPG, PNG ou WebP");
    expect(validateAccountAvatar({ type: "image/png", size: 0 })).toContain("até 2 MB");
    expect(validateAccountAvatar({ type: "image/png", size: 2 * 1024 * 1024 + 1 })).toContain("até 2 MB");
  });
});
