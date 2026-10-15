import { describe, expect, it } from "vitest";
import { parseOpened, unopenedFlaggedAnamneses, withOpened, OPENED_REPORTS_MAX } from "./anamnesisAlerts";
import type { Assessment } from "./assessments";

const NOW = Date.UTC(2026, 9, 15);
const DAY = 86_400_000;
const base = (id: string, submittedAt: number, extra: Partial<Assessment> = {}): Assessment => ({
  id, studentId: "s1", trainerId: "t1", submittedAt, parQAnswers: {}, goal: "", experienceLevel: "", trainingDays: [],
  anamnesis: { version: 1, answers: {} }, consentVersion: "anamnese-v1", consentAt: submittedAt, ...extra,
});

describe("opened reports memory", () => {
  it("reads garbage as empty and keeps only strings", () => {
    expect(parseOpened(null)).toEqual([]);
    expect(parseOpened("not json")).toEqual([]);
    expect(parseOpened("{\"a\":1}")).toEqual([]);
    expect(parseOpened("[\"a\",1,\"b\"]")).toEqual(["a", "b"]);
  });
  it("adds an id once, newest last, within the cap", () => {
    expect(parseOpened(withOpened(withOpened(null, "a"), "b"))).toEqual(["a", "b"]);
    expect(parseOpened(withOpened(withOpened(null, "a"), "a"))).toEqual(["a"]);
    let raw: string | null = null;
    for (let i = 0; i < OPENED_REPORTS_MAX + 5; i++) raw = withOpened(raw, `id${i}`);
    const ids = parseOpened(raw);
    expect(ids).toHaveLength(OPENED_REPORTS_MAX);
    expect(ids[ids.length - 1]).toBe(`id${OPENED_REPORTS_MAX + 4}`);
  });
});

describe("unopenedFlaggedAnamneses", () => {
  const flagged = { parQAnswers: { heart_condition: true } };
  it("alerts for a recent anamnese with a flag that was not opened", () => {
    const result = unopenedFlaggedAnamneses([base("a1", NOW - 2 * DAY, flagged)], new Set(), NOW);
    expect(result).toEqual([{ assessmentId: "a1", studentId: "s1", submittedAt: NOW - 2 * DAY, points: 1 }]);
  });
  it("stays quiet when opened, old, unflagged or a plain self-assessment", () => {
    expect(unopenedFlaggedAnamneses([base("a1", NOW - DAY, flagged)], new Set(["a1"]), NOW)).toEqual([]);
    expect(unopenedFlaggedAnamneses([base("a2", NOW - 40 * DAY, flagged)], new Set(), NOW)).toEqual([]);
    expect(unopenedFlaggedAnamneses([base("a3", NOW - DAY)], new Set(), NOW)).toEqual([]);
    expect(unopenedFlaggedAnamneses([base("a4", NOW - DAY, { ...flagged, anamnesis: null })], new Set(), NOW)).toEqual([]);
  });
});
