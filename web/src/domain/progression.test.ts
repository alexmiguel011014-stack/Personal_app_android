import { describe, expect, it } from "vitest";
import type { WorkoutLogDoc } from "./metrics";
import { formatSets, loadProgression, loggedExercises, recentLogs } from "./progression";

function log(id: string, exerciseName: string, date: number, sets: { weight: string; reps: number }[]): WorkoutLogDoc {
  return {
    id,
    trainerId: "t1",
    studentId: "s1",
    workoutId: "w1",
    exerciseName,
    date,
    performedSetsJson: JSON.stringify(sets.map((set, index) => ({ setNumber: index + 1, ...set }))),
    note: null,
  };
}

describe("loggedExercises", () => {
  it("lists each exercise once, in pt-BR order — not code-unit order, which puts lowercase last", () => {
    const logs = [
      log("1", "Supino", 1, []),
      log("2", "agachamento livre", 2, []),
      log("3", "Elevação pélvica", 3, []),
      log("4", "Supino", 4, []),
    ];
    expect(loggedExercises(logs)).toEqual(["agachamento livre", "Elevação pélvica", "Supino"]);
  });
});

describe("loadProgression — ExerciseProgressionChart's points", () => {
  it("takes each session's heaviest set, oldest first", () => {
    const logs = [
      log("b", "Supino", 20, [{ weight: "30", reps: 10 }, { weight: "32.5", reps: 8 }]),
      log("a", "Supino", 10, [{ weight: "30", reps: 10 }]),
      log("c", "Remada", 15, [{ weight: "50", reps: 10 }]),
    ];
    expect(loadProgression(logs, "Supino")).toEqual([
      { date: 10, maxWeight: 30 },
      { date: 20, maxWeight: 32.5 },
    ]);
  });

  it("counts only what the phone's toFloatOrNull reads — padding yes, a comma or a unit no", () => {
    const logs = [
      log("a", "Supino", 1, [{ weight: " 22.5 ", reps: 10 }, { weight: "40,5", reps: 8 }, { weight: "50kg", reps: 6 }]),
      log("b", "Supino", 2, [{ weight: "livre", reps: 12 }]),
    ];
    expect(loadProgression(logs, "Supino")).toEqual([{ date: 1, maxWeight: 22.5 }]);
  });

  it("skips a log whose sets can't be decoded", () => {
    const broken = { ...log("a", "Supino", 1, []), performedSetsJson: "{not json" };
    expect(loadProgression([broken], "Supino")).toEqual([]);
  });
});

describe("recentLogs / formatSets — 'Atividade Recente'", () => {
  it("keeps the latest ten, newest first", () => {
    const logs = Array.from({ length: 12 }, (_, i) => log(`l${i}`, "Supino", i, []));
    const recent = recentLogs(logs);
    expect(recent.map((l) => l.date)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  });

  it("lists sets as the phone does", () => {
    expect(formatSets([{ setNumber: 1, weight: "20", reps: 12 }, { setNumber: 2, weight: "22,5", reps: 10 }])).toBe(
      "20x12 · 22,5x10",
    );
  });
});
