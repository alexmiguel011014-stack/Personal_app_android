import { describe, expect, it } from "vitest";
import type { Ficha } from "./fichas";
import type { WorkoutLogDoc } from "./metrics";
import { nextTreino } from "./nextTreino";
import { hourClock, scheduleLines, type Schedule } from "./schedules";
import { mondayOf, weekSummary, weekSummaryText } from "./weekSummary";
import type { Workout } from "./workouts";

// GOALS.md §38f: "Próximo treino", "Esta semana" and "Meus horários" on the aluno's home.

const treino = (id: string, name: string): Workout => ({
  id,
  trainerId: "t",
  studentId: "s",
  name,
  isActive: true,
  exercises: [],
  createdAt: 0,
  status: "assigned",
  assignedAt: 0,
  ficha: null,
});
const A = treino("a", "Treino A");
const B = treino("b", "Treino B");
const C = treino("c", "Treino C");
const ficha = (id: string, treinos: Workout[]): Ficha => ({
  id,
  name: `Ficha ${id}`,
  createdAt: 0,
  updatedAt: 0,
  legacy: false,
  treinos,
});
const log = (workoutId: string, date: number): WorkoutLogDoc => ({
  id: `${workoutId}-${date}`,
  trainerId: "t",
  studentId: "s",
  workoutId,
  exerciseName: "Supino",
  date,
  performedSetsJson: "[]",
  note: null,
});

describe("nextTreino", () => {
  const current = ficha("new", [A, B, C]);

  it("is the first treino when nothing has been logged", () => {
    expect(nextTreino([current], [])).toEqual({
      treino: A,
      ficha: current,
      after: null,
    });
  });

  it("is the one after the treino trained last", () => {
    expect(nextTreino([current], [log("a", 1), log("b", 2)])?.treino).toBe(C);
    expect(nextTreino([current], [log("a", 1)])).toMatchObject({
      treino: B,
      after: A,
    });
  });

  it("goes by the newest log, whatever the order of the list", () => {
    expect(
      nextTreino([current], [log("b", 5), log("a", 9), log("c", 2)])?.treino,
    ).toBe(B);
  });

  it("wraps round from the last treino to the first", () => {
    expect(nextTreino([current], [log("c", 3)])).toMatchObject({
      treino: A,
      after: C,
    });
  });

  it("ignores logs of a treino that was deleted, and of another ficha", () => {
    const old = ficha("old", [treino("x", "Treino X")]);
    expect(nextTreino([current, old], [log("gone", 99), log("x", 98)])).toEqual(
      { treino: A, ficha: current, after: null },
    );
    expect(
      nextTreino([current, old], [log("a", 1), log("gone", 99)])?.treino,
    ).toBe(B);
  });

  it("only looks at the newest ficha", () => {
    const old = ficha("old", [
      treino("x", "Treino X"),
      treino("y", "Treino Y"),
    ]);
    expect(nextTreino([current, old], [log("x", 10)])?.ficha).toBe(current);
  });

  it("returns to itself when the ficha has one treino", () => {
    const single = ficha("one", [A]);
    expect(nextTreino([single], [log("a", 1)])).toMatchObject({
      treino: A,
      after: A,
    });
  });

  it("is null when there is nothing to do", () => {
    expect(nextTreino([], [])).toBeNull();
    expect(nextTreino([ficha("empty", [])], [log("a", 1)])).toBeNull();
  });
});

describe("weekSummary", () => {
  // 2026-10-14 is a Wednesday: the week runs Mon 12 to Sun 18.
  it("finds the Monday of the week", () => {
    expect(mondayOf("2026-10-14")).toBe("2026-10-12");
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // a Sunday belongs to the week that ends on it
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });

  it("lists Seg to Dom with what was done, today, what was missed and what is ahead", () => {
    const summary = weekSummary(
      new Set(["2026-10-12", "2026-10-09"]),
      "2026-10-14",
    );
    expect(summary.days.map((day) => day.label)).toEqual([
      "Seg",
      "Ter",
      "Qua",
      "Qui",
      "Sex",
      "Sáb",
      "Dom",
    ]);
    expect(summary.days.map((day) => day.state)).toEqual([
      "done",
      "missed",
      "today",
      "future",
      "future",
      "future",
      "future",
    ]);
    expect(
      summary.days.filter((day) => day.isToday).map((day) => day.date),
    ).toEqual(["2026-10-14"]);
  });

  it("counts the days trained this week and this month (not last week's, not other months')", () => {
    const trained = new Set([
      "2026-10-12",
      "2026-10-14",
      "2026-10-09",
      "2026-10-03",
      "2026-09-30",
    ]);
    const summary = weekSummary(trained, "2026-10-14");
    expect(summary.thisWeek).toBe(2);
    expect(summary.thisMonth).toBe(4);
  });

  it("marks today as done when today was trained", () => {
    expect(
      weekSummary(new Set(["2026-10-14"]), "2026-10-14").days[2]?.state,
    ).toBe("done");
  });

  it("does not count a day after today (a clock set back, a log from another zone)", () => {
    expect(weekSummary(new Set(["2026-10-16"]), "2026-10-14").thisMonth).toBe(
      0,
    );
  });

  it("writes the sentence with the singular where it belongs", () => {
    expect(weekSummaryText({ days: [], thisWeek: 1, thisMonth: 1 })).toBe(
      "1 treino esta semana · 1 no mês",
    );
    expect(weekSummaryText({ days: [], thisWeek: 0, thisMonth: 7 })).toBe(
      "0 treinos esta semana · 7 no mês",
    );
  });
});

describe("scheduleLines", () => {
  const slot = (dayOfWeek: string, hour: string): Schedule => ({
    id: `${dayOfWeek}${hour}`,
    trainerId: "t",
    studentId: "s",
    dayOfWeek,
    hour,
  });

  it("groups the days of one hour, in week order", () => {
    expect(
      scheduleLines([
        slot("Sexta", "07h"),
        slot("Segunda", "07h"),
        slot("Quarta", "07h"),
      ]),
    ).toEqual(["Seg, Qua, Sex · 07:00"]);
  });

  it("gives one line per hour, earliest first", () => {
    expect(
      scheduleLines([
        slot("Terça", "18h"),
        slot("Segunda", "07h"),
        slot("Quinta", "18h"),
      ]),
    ).toEqual(["Seg · 07:00", "Ter, Qui · 18:00"]);
  });

  it("puts Sábado and Domingo last and shows a day once", () => {
    expect(
      scheduleLines([
        slot("Domingo", "09h"),
        slot("Sábado", "09h"),
        slot("Segunda", "09h"),
        slot("Segunda", "09h"),
      ]),
    ).toEqual(["Seg, Sáb, Dom · 09:00"]);
  });

  it("is empty when there are no appointments", () => {
    expect(scheduleLines([])).toEqual([]);
  });

  it("writes an hour as stored when it is not in the phone's shape", () => {
    expect(hourClock("07h")).toBe("07:00");
    expect(hourClock("7:30")).toBe("7:30");
  });
});
