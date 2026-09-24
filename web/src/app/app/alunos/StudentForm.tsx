"use client";

import { useState, type FormEvent } from "react";
import {
  GENDERS,
  LEVELS,
  TRAINING_DAYS,
  normalizeProfile,
  profileErrors,
  type StudentProfile,
} from "../../../domain/studentProfile";

// GOALS.md §23g: the Android AddStudentScreen/EditStudentScreen fields, as a plain form (phase 1).

export function StudentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: StudentProfile;
  submitLabel: string;
  onSubmit: (profile: StudentProfile) => Promise<void>;
}) {
  const [profile, setProfile] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<StudentProfile>) => setProfile((current) => ({ ...current, ...patch }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = profileErrors(profile);
    setErrors(found);
    if (found.length > 0) return;
    setBusy(true);
    try {
      await onSubmit(normalizeProfile(profile));
    } catch {
      setErrors(["Não foi possível salvar. Verifique a conexão e tente de novo."]);
    } finally {
      setBusy(false);
    }
  }

  function toggleDay(day: string, checked: boolean) {
    set({ trainingDays: checked ? [...profile.trainingDays, day] : profile.trainingDays.filter((d) => d !== day) });
  }

  return (
    <form onSubmit={submit}>
      <p>
        <label>
          Nome <input value={profile.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
      </p>
      <fieldset>
        <legend>Sexo</legend>
        {GENDERS.map((gender) => (
          <label key={gender}>
            <input type="radio" name="gender" checked={profile.gender === gender} onChange={() => set({ gender })} /> {gender}{" "}
          </label>
        ))}
      </fieldset>
      <p>
        <label>
          Telefone <input type="tel" value={profile.phone} onChange={(e) => set({ phone: e.target.value })} />
        </label>
      </p>
      <p>
        <label>
          Objetivo <input value={profile.goal} onChange={(e) => set({ goal: e.target.value })} />
        </label>
      </p>
      <fieldset>
        <legend>Nível</legend>
        {LEVELS.map((level) => (
          <label key={level}>
            <input
              type="radio"
              name="level"
              checked={profile.experienceLevel === level}
              onChange={() => set({ experienceLevel: level })}
            />{" "}
            {level}{" "}
          </label>
        ))}
      </fieldset>
      <p>
        <label>
          Restrições médicas{" "}
          <textarea value={profile.medicalNotes} onChange={(e) => set({ medicalNotes: e.target.value })} />
        </label>
      </p>
      <fieldset>
        <legend>Dias de treino</legend>
        {TRAINING_DAYS.map((day) => (
          <label key={day}>
            <input
              type="checkbox"
              checked={profile.trainingDays.includes(day)}
              onChange={(e) => toggleDay(day, e.target.checked)}
            />{" "}
            {day}{" "}
          </label>
        ))}
      </fieldset>
      {errors.length > 0 && (
        <ul role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Salvando…" : submitLabel}
      </button>
    </form>
  );
}
