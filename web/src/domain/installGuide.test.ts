import { describe, expect, it } from "vitest";
import { GUIDES, detectPlatform, emphasisRuns, isStandaloneDisplay, type Platform } from "./installGuide";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 15; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG = "Mozilla/5.0 (Linux; Android 15; SM-S926B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36";
const WINDOWS_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

describe("detectPlatform", () => {
  it.each([
    ["iPhone Safari", IPHONE_SAFARI, 5, "ios"],
    ["Chrome on an iPhone", IPHONE_CHROME, 5, "ios"],
    ["an iPad asking for the desktop site", IPAD_DESKTOP_MODE, 5, "ios"],
    ["Android Chrome", ANDROID_CHROME, 5, "android"],
    ["Samsung Internet", ANDROID_SAMSUNG, 5, "android"],
    ["Windows Chrome", WINDOWS_CHROME, 0, "other"],
    ["a Mac without a touch screen", IPAD_DESKTOP_MODE, 0, "other"],
    ["an empty user agent", "", 0, "other"],
  ])("%s", (_name, userAgent, touchPoints, expected) => {
    expect(detectPlatform(userAgent, touchPoints)).toBe(expected);
  });

  it("treats a missing touch-point count as none", () => {
    expect(detectPlatform(IPAD_DESKTOP_MODE)).toBe("other");
  });
});

describe("isStandaloneDisplay", () => {
  it("is true when either signal says the site runs as an installed app", () => {
    expect(isStandaloneDisplay(true, undefined)).toBe(true);
    expect(isStandaloneDisplay(false, true)).toBe(true);
    expect(isStandaloneDisplay(false, false)).toBe(false);
    expect(isStandaloneDisplay(false, undefined)).toBe(false);
  });
});

describe("emphasisRuns", () => {
  it("marks the text between double asterisks as strong", () => {
    expect(emphasisRuns("Toque em **Compartilhar** agora")).toEqual([
      { text: "Toque em ", strong: false },
      { text: "Compartilhar", strong: true },
      { text: " agora", strong: false },
    ]);
  });

  it("handles a strong start, a strong end and two of them", () => {
    expect(emphasisRuns("**Um** e **dois**")).toEqual([
      { text: "Um", strong: true },
      { text: " e ", strong: false },
      { text: "dois", strong: true },
    ]);
  });

  it("leaves text with an unpaired marker, or none, as plain text", () => {
    expect(emphasisRuns("sem marcação")).toEqual([{ text: "sem marcação", strong: false }]);
    expect(emphasisRuns("meio ** aberto")).toEqual([{ text: "meio ** aberto", strong: false }]);
  });
});

describe("the guides", () => {
  const platforms = Object.keys(GUIDES) as Platform[];

  it("have both platforms, each under its own key", () => {
    expect(platforms.sort()).toEqual(["android", "ios"]);
    for (const platform of platforms) expect(GUIDES[platform].platform).toBe(platform);
  });

  it.each(platforms)("%s: steps and problems have unique ids and real text", (platform) => {
    const guide = GUIDES[platform];
    expect(guide.steps.length).toBeGreaterThanOrEqual(4);
    expect(new Set(guide.steps.map((step) => step.id)).size).toBe(guide.steps.length);
    expect(new Set(guide.problems.map((problem) => problem.id)).size).toBe(guide.problems.length);
    for (const step of guide.steps) {
      expect(step.title.trim(), step.id).not.toBe("");
      expect(step.body.trim(), step.id).not.toBe("");
    }
    for (const problem of guide.problems) {
      expect(problem.question.trim(), problem.id).not.toBe("");
      expect(problem.answer.trim(), problem.id).not.toBe("");
    }
  });

  it.each(platforms)("%s: every ** marker is paired and a highlight sits inside its picture", (platform) => {
    const guide = GUIDES[platform];
    const texts = [...guide.steps.map((step) => step.body), ...guide.problems.map((problem) => problem.answer)];
    for (const text of texts) expect(text.split("**").length % 2, text).toBe(1);
    for (const step of guide.steps) {
      // A ring means nothing without the picture it sits on.
      if (step.highlight !== undefined) {
        expect(step.shot, step.id).toBeDefined();
        const { x, y, w, h } = step.highlight;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        expect(x + w).toBeLessThanOrEqual(100);
        expect(y + h).toBeLessThanOrEqual(100);
      }
    }
  });

  it("the last step of each guide ends in signing in", () => {
    for (const platform of platforms) {
      const last = GUIDES[platform].steps.at(-1);
      expect(last?.body).toContain("Manter conectado");
    }
  });
});
