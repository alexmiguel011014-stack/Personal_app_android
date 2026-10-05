import { describe, expect, it } from "vitest";
import { draftToFirestore, linkedProfileUpdate, newInviteCode } from "../data/students";
import { WEEKDAYS } from "./dates";
import { LEVELS, TRAINING_DAYS, emptyProfile, normalizeProfile, profileErrors } from "./studentProfile";

describe("the student profile form", () => {
  it("starts with the Android form's defaults and stores its exact values", () => {
    expect(emptyProfile()).toMatchObject({ gender: "Masculino", experienceLevel: "Iniciante", trainingDays: [] });
    // "Interm." is what the Android screen writes; a different spelling would be foreign to it.
    expect(LEVELS).toEqual(["Iniciante", "Interm.", "Avançado"]);
    expect([...TRAINING_DAYS].sort()).toEqual([...WEEKDAYS].sort());
  });

  it("requires a name and at least one training day, as the Android form does", () => {
    expect(profileErrors(emptyProfile())).toHaveLength(2);
    expect(profileErrors({ ...emptyProfile(), name: "  ", trainingDays: ["Segunda"] })).toEqual(["Informe o nome do aluno."]);
    expect(profileErrors({ ...emptyProfile(), name: "Ana", trainingDays: ["Segunda"] })).toEqual([]);
  });

  it("trims text and keeps training days in week order, once each", () => {
    const profile = normalizeProfile({
      ...emptyProfile(),
      name: "  Ana Costa ",
      trainingDays: ["Sexta", "Segunda", "Sexta", "Feriado"],
    });
    expect(profile.name).toBe("Ana Costa");
    expect(profile.trainingDays).toEqual(["Segunda", "Sexta"]);
  });
});

describe("the documents a trainer writes", () => {
  const profile = { ...emptyProfile(), name: "Ana", trainingDays: ["Segunda"] };

  it("writes a draft with FirestoreMappers' field set", () => {
    expect(Object.keys(draftToFirestore("t1", profile, 5)).sort()).toEqual(
      ["createdAt", "experienceLevel", "gender", "goal", "medicalNotes", "name", "paused", "phone", "role", "trainerId", "trainingDays"],
    );
  });

  it("preserves a draft's pause flag when its profile is rewritten", () => {
    expect(draftToFirestore("t1", profile, 5, true).paused).toBe(true);
    expect(draftToFirestore("t1", profile, 5).paused).toBe(false);
  });

  it("touches only toLinkedStudentUpdateMap's fields on a connected account — what the rules allow", () => {
    expect(Object.keys(linkedProfileUpdate(profile)).sort()).toEqual(
      ["experienceLevel", "gender", "goal", "medicalNotes", "name", "phone", "trainingDays"],
    );
  });

  it("makes invite codes like the Android app: 8 uppercase hex characters", () => {
    expect(newInviteCode()).toMatch(/^[0-9A-F]{8}$/);
  });
});
