import { describe, expect, it } from "vitest";
import { claimedDrafts, filterStudentsByPause, mergeStudents, type DraftStudentDoc, type LinkedStudentDoc } from "./students";

function draft(id: string, name: string): DraftStudentDoc {
  return {
    id,
    trainerId: "t1",
    name,
    role: "student",
    gender: "Feminino",
    phone: "",
    goal: "",
    experienceLevel: "",
    medicalNotes: "",
    trainingDays: [],
    createdAt: 0,
    paused: false,
  };
}

function account(id: string, name: string, inviteCode: string | null): LinkedStudentDoc {
  return {
    id,
    trainerId: "t1",
    role: "STUDENT",
    inviteCode,
    name,
    gender: "Feminino",
    phone: "",
    goal: "",
    experienceLevel: "",
    medicalNotes: "",
    trainingDays: [],
    createdAt: 0,
    canSelfAssess: false,
    canLogBiometrics: false,
    canAddSets: false,
    pendingAssessmentRequest: false,
    paused: false,
  };
}

describe("claimedDrafts", () => {
  it("maps each account to the draft its invite came from, skipping what can't be traced", () => {
    const claimed = claimedDrafts(
      [account("u1", "Maria", "ABC123"), account("u2", "Ana", null), account("u3", "Rita", "GONE")],
      new Map([["ABC123", "d1"]]),
    );
    expect([...claimed]).toEqual([["u1", "d1"]]);
  });
});

describe("mergeStudents", () => {
  it("drops a draft once its invite has been claimed, so the student isn't listed twice", () => {
    const merged = mergeStudents(
      [draft("d1", "Maria"), draft("d2", "João")],
      [account("u1", "Maria", "ABC123")],
      new Map([["ABC123", "d1"]]),
    );
    expect(merged.map((student) => [student.id, student.linked])).toEqual([
      ["d2", false],
      ["u1", true],
    ]);
  });

  it("keeps the draft when the account can't be traced back to it — it never matches by name", () => {
    const drafts = [draft("d1", "Maria")];
    // No invite code on the account.
    expect(mergeStudents(drafts, [account("u1", "Maria", null)], new Map()).map((s) => s.id)).toEqual([
      "d1",
      "u1",
    ]);
    // The invite was deleted, so the two-hop link is gone.
    expect(
      mergeStudents(drafts, [account("u1", "Maria", "GONE")], new Map()).map((s) => s.id),
    ).toEqual(["d1", "u1"]);
  });

  it("keeps pause state on linked and draft rows", () => {
    const merged = mergeStudents(
      [{ ...draft("d1", "Rita"), paused: true }],
      [{ ...account("u1", "Ana", null), paused: true }],
      new Map(),
    );
    expect(merged.map((student) => student.paused)).toEqual([true, true]);
  });
});

describe("filterStudentsByPause", () => {
  const students = [
    { id: "active", name: "Ativo", linked: true, goal: "", medicalNotes: "", trainingDays: [], createdAt: 0, pendingAssessmentRequest: false, paused: false },
    { id: "paused", name: "Pausado", linked: false, goal: "", medicalNotes: "", trainingDays: [], createdAt: 0, pendingAssessmentRequest: false, paused: true },
  ];

  it("defaults to active students and supports paused or all", () => {
    expect(filterStudentsByPause(students).map((student) => student.id)).toEqual(["active"]);
    expect(filterStudentsByPause(students, "paused").map((student) => student.id)).toEqual(["paused"]);
    expect(filterStudentsByPause(students, "all").map((student) => student.id)).toEqual(["active", "paused"]);
  });
});
