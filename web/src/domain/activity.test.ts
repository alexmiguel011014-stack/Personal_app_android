import { describe, expect, it } from "vitest";
import { activityDocId, emptyActions, monthOf, shouldWriteLastSeen } from "./activity";

describe("activity helpers", () => {
  it("starts every counter at zero and uses trainer/month document ids", () => {
    expect(Object.values(emptyActions()).every((count) => count === 0)).toBe(true);
    expect(activityDocId("trainerA", "2026-10")).toBe("trainerA_2026-10");
    expect(monthOf("2026-10-01")).toBe("2026-10");
  });

  it("throttles last-seen writes to ten minutes", () => {
    expect(shouldWriteLastSeen(null, 1_000_000)).toBe(true);
    expect(shouldWriteLastSeen(1_000_000, 1_599_999)).toBe(false);
    expect(shouldWriteLastSeen(1_000_000, 1_600_000)).toBe(true);
  });
});
