import { describe, expect, it } from "vitest";
import { resendWaitSeconds, verificationContinueUrl } from "./emailVerification";

describe("verificationContinueUrl", () => {
  it("returns to the same invite, with the trailing slash", () => {
    expect(verificationContinueUrl("http://localhost:3000", "", "AB12CD34")).toBe(
      "http://localhost:3000/convite/?c=AB12CD34",
    );
  });

  it("carries the Pages sub-path, with or without a trailing slash on it", () => {
    const expected = "https://x.github.io/Personal_app_android/convite/?c=AB12CD34";
    expect(verificationContinueUrl("https://x.github.io", "/Personal_app_android", "AB12CD34")).toBe(expected);
    expect(verificationContinueUrl("https://x.github.io", "/Personal_app_android/", "AB12CD34")).toBe(expected);
  });

  it("encodes the code and drops the query when there is none", () => {
    expect(verificationContinueUrl("http://h", "", "A B&c")).toBe("http://h/convite/?c=A%20B%26c");
    expect(verificationContinueUrl("http://h", "", "")).toBe("http://h/convite/");
  });
});

describe("resendWaitSeconds", () => {
  it("lets the first mail go at once", () => {
    expect(resendWaitSeconds(null, 1_000)).toBe(0);
  });

  it("counts the cooldown down in whole seconds, rounding up", () => {
    expect(resendWaitSeconds(10_000, 10_000)).toBe(60);
    expect(resendWaitSeconds(10_000, 10_001)).toBe(60);
    expect(resendWaitSeconds(10_000, 69_000)).toBe(1);
    expect(resendWaitSeconds(10_000, 70_000)).toBe(0);
    expect(resendWaitSeconds(10_000, 500_000)).toBe(0);
  });

  it("takes another cooldown", () => {
    expect(resendWaitSeconds(0, 5_000, 30)).toBe(25);
  });
});
