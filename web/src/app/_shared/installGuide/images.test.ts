import { describe, expect, it } from "vitest";
import { GUIDES } from "../../../domain/installGuide";
import { SHOTS } from "./images";

describe("the install guide's pictures", () => {
  const used = Object.values(GUIDES).flatMap((guide) => guide.steps.flatMap((step) => (step.shot === undefined ? [] : [step.shot])));

  it("every step's shot key has a picture", () => {
    for (const key of used) expect(SHOTS[key], key).toBeDefined();
  });

  it("every picture has a description and is used by a step", () => {
    for (const [key, shot] of Object.entries(SHOTS)) {
      expect(shot.alt.trim(), key).not.toBe("");
      expect(used, key).toContain(key);
    }
  });

  it("no two steps share a picture", () => {
    expect(new Set(used).size).toBe(used.length);
  });
});
