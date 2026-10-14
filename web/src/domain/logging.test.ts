import { describe, expect, it } from "vitest";
import { formatDayMonth } from "./dates";
import {
  encodePerformedSets,
  type Exercise,
  type PerformedSet,
} from "./exercise";
import {
  LAST_PERFORMANCE_MAX_DAYS,
  displayWeight,
  formatLastSets,
  lastPerformance,
  repeatRows,
  rowPlaceholder,
} from "./lastPerformance";
import type { WorkoutLogDoc } from "./metrics";
import {
  DEFAULT_REST_SECONDS,
  MAX_TIMER_SECONDS,
  adjustRest,
  clock,
  isRestOver,
  remainingSeconds,
  restDuration,
} from "./restTimer";
import { numericWeight, summarizeSession } from "./sessionSummary";

// GOALS.md §38e: "Última vez", "Repetir a última", the rest timer and the post-save summary with its records.

const TZ = "America/Sao_Paulo";
const noon = (day: string) => Date.parse(`${day}T15:00:00Z`); // 12:00 in São Paulo
const set = (
  setNumber: number,
  weight: string,
  reps: number,
): PerformedSet => ({ setNumber, weight, reps });
let counter = 0;
const log = (
  exerciseName: string,
  day: string,
  sets: PerformedSet[],
  hourShift = 0,
): WorkoutLogDoc => ({
  id: `l${++counter}`,
  trainerId: "t",
  studentId: "s",
  workoutId: "w",
  exerciseName,
  date: noon(day) + hourShift * 3_600_000,
  performedSetsJson: encodePerformedSets(sets),
  note: null,
});
const supino: Exercise = {
  name: "Supino",
  sets: 3,
  reps: "12",
  weight: null,
  restSeconds: null,
  notes: null,
  muscleActivation: null,
};

describe("lastPerformance", () => {
  const logs = [
    log("Supino", "2026-10-01", [set(1, "30", 12)]),
    log("Supino", "2026-10-08", [set(1, "31", 12), set(2, "33.5", 10)]),
    log("Remada", "2026-10-09", [set(1, "40", 10)]),
    log("Supino", "2026-10-14", [set(1, "99", 1)]),
  ];

  it("is the newest session before the given day, for that exercise only", () => {
    expect(lastPerformance(logs, "Supino", "2026-10-14", TZ)).toEqual({
      day: "2026-10-08",
      sets: [set(1, "31", 12), set(2, "33.5", 10)],
    });
    expect(lastPerformance(logs, "Remada", "2026-10-14", TZ)?.day).toBe(
      "2026-10-09",
    );
  });

  it("never counts the day itself or later (today's own sets are not 'last time')", () => {
    expect(lastPerformance(logs, "Supino", "2026-10-08", TZ)?.day).toBe(
      "2026-10-01",
    );
    expect(lastPerformance(logs, "Supino", "2026-10-01", TZ)).toBeNull();
  });

  it("shows nothing when there is no log, or the last one is older than the limit", () => {
    expect(lastPerformance([], "Supino", "2026-10-14", TZ)).toBeNull();
    expect(lastPerformance(logs, "Agachamento", "2026-10-14", TZ)).toBeNull();
    const old = [log("Supino", "2026-01-01", [set(1, "20", 10)])];
    expect(lastPerformance(old, "Supino", "2026-04-30", TZ)?.day).toBe(
      "2026-01-01",
    ); // 119 days
    expect(lastPerformance(old, "Supino", "2026-05-02", TZ)).toBeNull(); // 121 days
    expect(LAST_PERFORMANCE_MAX_DAYS).toBe(120);
  });

  it("skips a log with no readable sets and takes the one before it", () => {
    const broken = {
      ...log("Supino", "2026-10-10", []),
      performedSetsJson: "not json",
    };
    expect(
      lastPerformance([...logs, broken], "Supino", "2026-10-14", TZ)?.day,
    ).toBe("2026-10-08");
  });

  it("takes the later of two sessions on the same day", () => {
    const two = [
      log("Supino", "2026-10-05", [set(1, "20", 10)], 0),
      log("Supino", "2026-10-05", [set(1, "25", 8)], 3),
    ];
    expect(
      lastPerformance(two, "Supino", "2026-10-14", TZ)?.sets[0]?.weight,
    ).toBe("25");
  });

  it("reads the day in the aluno's time zone, not UTC", () => {
    const lateNight = {
      ...log("Supino", "2026-10-13", [set(1, "50", 5)]),
      date: Date.parse("2026-10-14T02:30:00Z"),
    }; // 23:30 on the 13th
    expect(lastPerformance([lateNight], "Supino", "2026-10-14", TZ)?.day).toBe(
      "2026-10-13",
    );
    expect(
      lastPerformance([lateNight], "Supino", "2026-10-14", "UTC"),
    ).toBeNull();
  });
});

describe("formatting", () => {
  it("writes decimals with a comma and sets as weight×reps", () => {
    expect(displayWeight("33.5")).toBe("33,5");
    expect(displayWeight("20kg")).toBe("20kg");
    expect(displayWeight("livre")).toBe("livre");
    expect(formatLastSets([set(1, "31", 12), set(2, "33.5", 10)])).toBe(
      "31×12 · 33,5×10",
    );
    expect(formatDayMonth("2026-10-08")).toBe("08/10");
  });
});

describe("rowPlaceholder", () => {
  const last = {
    day: "2026-10-08",
    sets: [set(1, "31", 12), set(3, "33.5", 10)],
  };

  it("is the same set number from last time", () => {
    expect(rowPlaceholder(last, supino, 0)).toEqual({
      weight: "31",
      reps: "12",
    });
    expect(rowPlaceholder(last, supino, 2)).toEqual({
      weight: "33,5",
      reps: "10",
    });
  });

  it("falls back to the prescribed carga for a row last time did not have, or when there is no last time", () => {
    const withCarga = { ...supino, weight: " 40kg " };
    expect(rowPlaceholder(last, withCarga, 1)).toEqual({
      weight: "40kg",
      reps: "",
    });
    expect(rowPlaceholder(null, withCarga, 0)).toEqual({
      weight: "40kg",
      reps: "",
    });
    expect(rowPlaceholder(null, supino, 0)).toEqual({ weight: "", reps: "" });
  });
});

describe("repeatRows", () => {
  const blank = () => [0, 1, 2].map(() => ({ weight: "", reps: "" }));
  const last = {
    day: "2026-10-08",
    sets: [set(1, "31", 12), set(2, "33.5", 10)],
  };

  it("puts each set in the row of its number and leaves the other rows alone", () => {
    const rows = repeatRows(
      [
        { weight: "", reps: "" },
        { weight: "", reps: "" },
        { weight: "7", reps: "7" },
      ],
      last,
      3,
      false,
    );
    expect(rows).toEqual([
      { weight: "31", reps: "12" },
      { weight: "33.5", reps: "10" },
      { weight: "7", reps: "7" },
    ]);
  });

  it("keeps stored text as is (33.5 stays 33.5, so it reads back exactly)", () => {
    expect(repeatRows(blank(), last, 3, false)[1]?.weight).toBe("33.5");
  });

  it("does not create rows past the prescribed ones without the permission", () => {
    const long = {
      day: "2026-10-08",
      sets: [
        set(1, "20", 10),
        set(2, "20", 10),
        set(3, "20", 10),
        set(4, "20", 8),
        set(5, "20", 6),
      ],
    };
    expect(repeatRows(blank(), long, 3, false)).toHaveLength(3);
    const allowed = repeatRows(blank(), long, 3, true);
    expect(allowed).toHaveLength(5);
    expect(allowed[4]).toEqual({ weight: "20", reps: "6" });
  });

  it("never shortens what is already there", () => {
    const five = [0, 1, 2, 3, 4].map(() => ({ weight: "", reps: "" }));
    expect(repeatRows(five, last, 3, false)).toHaveLength(5);
  });
});

describe("restTimer", () => {
  it("starts the prescribed rest, else the default", () => {
    expect(restDuration(120)).toBe(120);
    expect(restDuration(null)).toBe(DEFAULT_REST_SECONDS);
    expect(restDuration(0)).toBe(DEFAULT_REST_SECONDS);
    expect(restDuration(99_999)).toBe(MAX_TIMER_SECONDS);
  });

  it("counts down from the end instant, rounding up, never below zero", () => {
    const start = 1_000_000;
    const end = start + 90_000;
    expect(remainingSeconds(end, start)).toBe(90);
    expect(remainingSeconds(end, start + 200)).toBe(90);
    expect(remainingSeconds(end, start + 1_000)).toBe(89);
    expect(remainingSeconds(end, end - 1)).toBe(1);
    expect(remainingSeconds(end, end)).toBe(0);
    expect(remainingSeconds(end, end + 60_000)).toBe(0);
  });

  it("is over exactly at the end instant, however late the tick comes", () => {
    expect(isRestOver(5_000, 4_999)).toBe(false);
    expect(isRestOver(5_000, 5_000)).toBe(true);
    expect(isRestOver(5_000, 9_000_000)).toBe(true);
  });

  it("moves the end by whole steps, never before now and never past the cap", () => {
    const now = 1_000_000;
    expect(adjustRest(now + 60_000, 15, now)).toBe(now + 75_000);
    expect(adjustRest(now + 60_000, -15, now)).toBe(now + 45_000);
    expect(adjustRest(now + 10_000, -15, now)).toBe(now);
    expect(adjustRest(now + MAX_TIMER_SECONDS * 1000, 15, now)).toBe(
      now + MAX_TIMER_SECONDS * 1000,
    );
  });

  it("writes m:ss", () => {
    expect(clock(90)).toBe("1:30");
    expect(clock(65)).toBe("1:05");
    expect(clock(9)).toBe("0:09");
    expect(clock(0)).toBe("0:00");
    expect(clock(-3)).toBe("0:00");
  });
});

describe("numericWeight", () => {
  it("reads a plain number, a comma decimal and a kg suffix; free text has none", () => {
    expect(numericWeight("40")).toBe(40);
    expect(numericWeight(" 42,5 ")).toBe(42.5);
    expect(numericWeight("42.5kg")).toBe(42.5);
    expect(numericWeight("20 KG")).toBe(20);
    expect(numericWeight("livre")).toBeNull();
    expect(numericWeight("")).toBeNull();
    expect(numericWeight("10-12")).toBeNull();
    expect(numericWeight("-5")).toBeNull();
  });
});

describe("summarizeSession", () => {
  const before = [
    log("Supino", "2026-10-01", [set(1, "40", 10), set(2, "42.5", 8)]),
    log("Remada", "2026-10-01", [set(1, "50", 10)]),
  ];

  it("counts exercises and sets", () => {
    const summary = summarizeSession(
      [
        ["Supino", [set(1, "40", 10), set(2, "40", 10)]],
        ["Remada", [set(1, "50", 10)]],
      ],
      before,
    );
    expect(summary).toMatchObject({ exercises: 2, sets: 3, records: [] });
  });

  it("names a record when the heaviest set beats everything logged before (not a tie)", () => {
    const summary = summarizeSession(
      [
        ["Supino", [set(1, "40", 10), set(2, "45", 6)]],
        ["Remada", [set(1, "50", 12)]],
      ],
      before,
    );
    expect(summary.records).toEqual([
      { exercise: "Supino", weight: 45, reps: 6, previousBest: 42.5 },
    ]);
  });

  it("takes the set with more reps when two sets share the heaviest weight", () => {
    const summary = summarizeSession(
      [["Supino", [set(1, "45", 4), set(2, "45", 7)]]],
      before,
    );
    expect(summary.records[0]).toMatchObject({ weight: 45, reps: 7 });
  });

  it("does not call a first time a record, nor free-text weights", () => {
    expect(
      summarizeSession([["Agachamento", [set(1, "80", 8)]]], before).records,
    ).toEqual([]);
    expect(
      summarizeSession([["Supino", [set(1, "livre", 20)]]], before).records,
    ).toEqual([]);
    const textual = [log("Barra", "2026-10-01", [set(1, "livre", 8)])];
    expect(
      summarizeSession([["Barra", [set(1, "10", 8)]]], textual).records,
    ).toEqual([]);
  });

  it("is empty for an empty session", () => {
    expect(summarizeSession([], before)).toEqual({
      exercises: 0,
      sets: 0,
      records: [],
    });
  });
});
