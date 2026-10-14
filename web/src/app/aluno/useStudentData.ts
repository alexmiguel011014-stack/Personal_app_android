"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { loadMyBiometrics } from "../../data/biometrics";
import { getFirebase } from "../../data/firebase";
import { loadMySchedules } from "../../data/schedules";
import { loadMyProfile } from "../../data/session";
import { loadMyLogs } from "../../data/workoutLogs";
import { loadMyWorkouts } from "../../data/workouts";
import type { Biometric } from "../../domain/biometrics";
import { localDate } from "../../domain/dates";
import type { WorkoutLogDoc } from "../../domain/metrics";
import { CACHE_TTL_MS, STUDENT_LOG_WINDOW_DAYS, windowStart } from "../../domain/readWindows";
import type { Schedule } from "../../domain/schedules";
import type { LinkedStudentDoc } from "../../domain/students";
import type { Workout } from "../../domain/workouts";
import { browserTimeZone } from "../_shared/browserTimeZone";

// GOALS.md §23h: what the student's screens show — StudentViewModel's four streams (profile,
// assigned fichas, measurements, logs), read through the same queries the phone uses.
//
// GOALS.md §38b: read once per browser session and shared by every /aluno page through
// <StudentDataProvider> (app/aluno/layout.tsx), memory only; the logs are the last STUDENT_LOG_WINDOW_DAYS
// days ("Evolução" reads the rest on request). Before, each page read everything again — about 1,000
// documents a page for an aluno with a year of training.

export type StudentData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      profile: LinkedStudentDoc;
      workouts: Workout[];
      biometrics: Biometric[];
      /** GOALS.md §38f: the aluno's own weekly appointments (a handful of documents). */
      schedules: Schedule[];
      /** The aluno's logs dated from `logsFrom` on, not all time. */
      logs: WorkoutLogDoc[];
      /** Epoch ms where `logs` starts. */
      logsFrom: number;
      /** Epoch ms of this load. */
      loadedAt: number;
      today: string;
      timeZone: string;
    };

const LOADING: StudentData = { status: "loading" };

class StudentDataStore {
  private state: StudentData = LOADING;
  private owner: string | null = null;
  private ticket = 0;
  private running = false;
  /** Set by invalidate(): the next page that asks reads again. */
  private stale = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  ownedBy(uid: string): boolean {
    return this.owner === uid;
  }

  private set(next: StudentData) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  request(uid: string, force = false): void {
    if (this.owner !== uid) {
      this.owner = uid;
      this.ticket++;
      this.running = false;
      this.set(LOADING);
      force = true;
    }
    if (this.running) return;
    if (!force && !this.stale && this.state.status === "ready") {
      const now = Date.now();
      if (now - this.state.loadedAt <= CACHE_TTL_MS && localDate(now, this.state.timeZone) === this.state.today) return;
    }
    void this.run(uid);
  }

  /** After a write whose page stays on screen (a session saved, an assessment sent): the next page reads again. */
  invalidate(): void {
    this.stale = true;
  }

  reload(uid: string): void {
    if (this.owner === uid) this.set(LOADING);
    this.request(uid, true);
  }

  private async run(uid: string): Promise<void> {
    const ticket = ++this.ticket;
    this.running = true;
    this.stale = false;
    try {
      const { db } = getFirebase();
      const now = Date.now();
      const timeZone = browserTimeZone();
      const today = localDate(now, timeZone);
      const logsFrom = windowStart(now, STUDENT_LOG_WINDOW_DAYS);
      const [profile, workouts, biometrics, schedules, logs] = await Promise.all([
        loadMyProfile(db, uid),
        loadMyWorkouts(db, uid),
        loadMyBiometrics(db, uid),
        loadMySchedules(db, uid),
        loadMyLogs(db, uid, logsFrom),
      ]);
      if (ticket !== this.ticket) return;
      if (profile === null) {
        this.set({ status: "error", message: "Não foi possível carregar seu perfil." });
        return;
      }
      this.set({ status: "ready", profile, workouts, biometrics, schedules, logs, logsFrom, loadedAt: now, today, timeZone });
    } catch {
      if (ticket === this.ticket) this.set({ status: "error", message: "Não foi possível carregar seus dados. Verifique a conexão." });
    } finally {
      if (ticket === this.ticket) this.running = false;
    }
  }
}

const StoreContext = createContext<StudentDataStore | null>(null);

/** One store per mounted /aluno area — app/aluno/layout.tsx wraps the pages in it. */
export function StudentDataProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new StudentDataStore(), []);
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useStudentData(uid: string) {
  const store = useContext(StoreContext);
  if (store === null) throw new Error("useStudentData() must be used inside <StudentDataProvider>.");
  const state = useSyncExternalStore(store.subscribe, store.getState, () => LOADING);

  useEffect(() => {
    store.request(uid);
  }, [store, uid]);

  const reload = useCallback(() => store.reload(uid), [store, uid]);
  const invalidate = useCallback(() => store.invalidate(), [store]);

  return { data: store.ownedBy(uid) ? state : LOADING, reload, invalidate };
}
