"use client";

import { useCallback, useEffect, useState } from "react";
import { loadMyBiometrics } from "../../data/biometrics";
import { getFirebase } from "../../data/firebase";
import { loadMyProfile } from "../../data/session";
import { loadMyLogs } from "../../data/workoutLogs";
import { loadMyWorkouts } from "../../data/workouts";
import type { Biometric } from "../../domain/biometrics";
import { localDate } from "../../domain/dates";
import type { WorkoutLogDoc } from "../../domain/metrics";
import type { LinkedStudentDoc } from "../../domain/students";
import type { Workout } from "../../domain/workouts";
import { browserTimeZone } from "../_shared/browserTimeZone";

// GOALS.md §23h: what the student's screens show — StudentViewModel's four streams (profile,
// assigned fichas, measurements, logs), read through the same queries the phone uses.

export type StudentData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      profile: LinkedStudentDoc;
      workouts: Workout[];
      biometrics: Biometric[];
      logs: WorkoutLogDoc[];
      today: string;
      timeZone: string;
    };

export function useStudentData(uid: string) {
  const [data, setData] = useState<StudentData>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const timeZone = browserTimeZone();
        const today = localDate(Date.now(), timeZone);
        const [profile, workouts, biometrics, logs] = await Promise.all([
          loadMyProfile(db, uid),
          loadMyWorkouts(db, uid),
          loadMyBiometrics(db, uid),
          loadMyLogs(db, uid),
        ]);
        if (cancelled) return;
        if (profile === null) {
          setData({ status: "error", message: "Não foi possível carregar seu perfil." });
          return;
        }
        setData({ status: "ready", profile, workouts, biometrics, logs, today, timeZone });
      } catch {
        if (!cancelled) setData({ status: "error", message: "Não foi possível carregar seus dados. Verifique a conexão." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, version]);

  const reload = useCallback(() => {
    setData({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  return { data, reload };
}
