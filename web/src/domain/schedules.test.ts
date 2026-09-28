import { describe, expect, it } from "vitest";
import { AGENDA_DAYS, AGENDA_HOURS, bookingsAt, bookingsOn, type Schedule } from "./schedules";

function booking(id: string, dayOfWeek: string, hour: string): Schedule {
  return { id, trainerId: "t1", studentId: `s-${id}`, dayOfWeek, hour };
}

describe("the agenda grid", () => {
  it("has ScheduleScreen's days, Monday first, in the strings the phone stores", () => {
    expect(AGENDA_DAYS).toEqual(["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]);
  });

  it("has DayAgendaItem's sixteen slots, 06h to 21h", () => {
    expect(AGENDA_HOURS).toHaveLength(16);
    expect([AGENDA_HOURS[0], AGENDA_HOURS[3], AGENDA_HOURS[15]]).toEqual(["06h", "09h", "21h"]);
  });
});

describe("bookingsAt / bookingsOn", () => {
  const schedules = [
    booking("a", "Segunda", "08h"),
    booking("b", "Segunda", "08h"),
    booking("c", "Segunda", "09h"),
    booking("d", "Terça", "08h"),
  ];

  it("returns every booking in a slot — a double booking shows twice instead of hiding one", () => {
    expect(bookingsAt(schedules, "Segunda", "08h").map((s) => s.id)).toEqual(["a", "b"]);
    expect(bookingsAt(schedules, "Quarta", "08h")).toEqual([]);
  });

  it("counts a weekday's bookings, like the phone's badge", () => {
    expect(bookingsOn(schedules, "Segunda")).toBe(3);
    expect(bookingsOn(schedules, "Domingo")).toBe(0);
  });
});
