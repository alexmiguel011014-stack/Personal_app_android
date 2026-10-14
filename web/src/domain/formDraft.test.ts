import { describe, expect, it } from "vitest";
import {
  ANAMNESIS_DRAFT_MAX_AGE_MS,
  LOG_DRAFT_MAX_AGE_MS,
  applyLogDraft,
  draftKey,
  logDraftHasContent,
  parseDraft,
  readDraft,
  removeDraft,
  serializeDraft,
  validateLogDraft,
  writeDraft,
  type StorageLike,
} from "./formDraft";

const NOW = Date.parse("2026-10-13T12:00:00-03:00");
const HOUR = 3_600_000;
const identity = (data: unknown) => data as { x: number };

describe("draftKey", () => {
  it("separates forms, people and treinos, so another treino's draft is never offered", () => {
    expect(draftKey("log", "u1", "w1")).toBe("allu:draft:log:u1:w1");
    expect(draftKey("log", "u1", "w2")).not.toBe(draftKey("log", "u1", "w1"));
    expect(draftKey("log", "u2", "w1")).not.toBe(draftKey("log", "u1", "w1"));
    expect(draftKey("anamnese", "u1")).toBe("allu:draft:anamnese:u1");
  });
});

describe("parseDraft", () => {
  const raw = serializeDraft({ x: 1 }, NOW);

  it("returns the data and when it was saved", () => {
    expect(parseDraft(raw, NOW + HOUR, LOG_DRAFT_MAX_AGE_MS, identity)).toEqual({ data: { x: 1 }, savedAt: NOW });
  });

  it("expires: a log draft after 24 h, an anamnese draft after 7 days", () => {
    expect(parseDraft(raw, NOW + LOG_DRAFT_MAX_AGE_MS, LOG_DRAFT_MAX_AGE_MS, identity)).not.toBeNull();
    expect(parseDraft(raw, NOW + LOG_DRAFT_MAX_AGE_MS + 1, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
    expect(parseDraft(raw, NOW + 6 * 24 * HOUR, ANAMNESIS_DRAFT_MAX_AGE_MS, identity)).not.toBeNull();
    expect(parseDraft(raw, NOW + 8 * 24 * HOUR, ANAMNESIS_DRAFT_MAX_AGE_MS, identity)).toBeNull();
  });

  it("does not trust a draft stamped in the future (a clock that was wrong)", () => {
    expect(parseDraft(raw, NOW - 10 * 60_000, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
    expect(parseDraft(raw, NOW - 30_000, LOG_DRAFT_MAX_AGE_MS, identity)).not.toBeNull();
  });

  it("ignores corrupt, foreign or empty storage", () => {
    for (const bad of [null, undefined, "", "not json", "[]", "null", "42", '{"v":1}', '{"v":2,"savedAt":1,"data":{}}', '{"v":1,"savedAt":"x","data":{}}']) {
      expect(parseDraft(bad, NOW, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
    }
  });

  it("drops data the validator does not accept", () => {
    expect(parseDraft(raw, NOW, LOG_DRAFT_MAX_AGE_MS, () => null)).toBeNull();
  });
});

describe("storage that is missing or throws — the form must still work", () => {
  const throwing: StorageLike = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };

  it("reads nothing, writes nothing and removes nothing, without throwing", () => {
    expect(readDraft(throwing, "k", NOW, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
    expect(() => writeDraft(throwing, "k", { x: 1 }, NOW)).not.toThrow();
    expect(() => removeDraft(throwing, "k")).not.toThrow();
    expect(readDraft(null, "k", NOW, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
    expect(() => writeDraft(null, "k", { x: 1 }, NOW)).not.toThrow();
    expect(() => removeDraft(null, "k")).not.toThrow();
  });

  it("round-trips through a working storage and is gone after removeDraft", () => {
    const map = new Map<string, string>();
    const storage: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
    writeDraft(storage, "k", { x: 7 }, NOW);
    expect(readDraft(storage, "k", NOW + HOUR, LOG_DRAFT_MAX_AGE_MS, identity)?.data).toEqual({ x: 7 });
    removeDraft(storage, "k");
    expect(readDraft(storage, "k", NOW + HOUR, LOG_DRAFT_MAX_AGE_MS, identity)).toBeNull();
  });
});

describe("validateLogDraft", () => {
  it("accepts rows of weight and reps text", () => {
    expect(validateLogDraft({ Supino: [{ weight: "20", reps: "12" }, { weight: "", reps: "" }] })).toEqual({
      Supino: [
        { weight: "20", reps: "12" },
        { weight: "", reps: "" },
      ],
    });
  });

  it("rejects anything shaped differently", () => {
    expect(validateLogDraft(null)).toBeNull();
    expect(validateLogDraft([])).toBeNull();
    expect(validateLogDraft({ Supino: "x" })).toBeNull();
    expect(validateLogDraft({ Supino: [{ weight: 20, reps: "12" }] })).toBeNull();
    expect(validateLogDraft({ Supino: [null] })).toBeNull();
    expect(validateLogDraft({ Supino: [{ weight: "x".repeat(41), reps: "1" }] })).toBeNull();
    expect(validateLogDraft({ Supino: Array.from({ length: 31 }, () => ({ weight: "1", reps: "1" })) })).toBeNull();
    expect(validateLogDraft(Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`e${i}`, []])))).toBeNull();
  });
});

describe("logDraftHasContent", () => {
  it("is false for an untouched form and true as soon as one cell has text", () => {
    expect(logDraftHasContent({ Supino: [{ weight: "", reps: " " }] })).toBe(false);
    expect(logDraftHasContent({ Supino: [{ weight: "", reps: "" }, { weight: "20", reps: "" }] })).toBe(true);
    expect(logDraftHasContent(new Map([["Supino", [{ weight: "", reps: "8" }]]]))).toBe(true);
  });
});

describe("applyLogDraft", () => {
  const blank = (n: number) => Array.from({ length: n }, () => ({ weight: "", reps: "" }));
  const initial = new Map([
    ["Supino", blank(3)],
    ["Remada", blank(2)],
  ]);

  it("lays the saved rows over the prescription and leaves the rest as it was", () => {
    const merged = applyLogDraft(initial, { Supino: [{ weight: "20", reps: "12" }, { weight: "22", reps: "10" }, { weight: "", reps: "" }] }, false);
    expect(merged.get("Supino")).toEqual([
      { weight: "20", reps: "12" },
      { weight: "22", reps: "10" },
      { weight: "", reps: "" },
    ]);
    expect(merged.get("Remada")).toEqual(blank(2));
  });

  it("ignores exercises the treino no longer has", () => {
    const merged = applyLogDraft(initial, { Rosca: [{ weight: "9", reps: "9" }] }, true);
    expect([...merged.keys()]).toEqual(["Supino", "Remada"]);
  });

  it("brings extra rows back only when the trainer allows extra sets — a draft cannot grant more than the permission", () => {
    const saved = { Remada: [{ weight: "30", reps: "10" }, { weight: "30", reps: "9" }, { weight: "28", reps: "8" }] };
    expect(applyLogDraft(initial, saved, false).get("Remada")).toHaveLength(2);
    expect(applyLogDraft(initial, saved, true).get("Remada")).toEqual(saved.Remada);
  });
});
