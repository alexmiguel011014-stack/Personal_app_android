"use client";

import { FirebaseError } from "firebase/app";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { getFirebase } from "../../data/firebase";
import { ensureCharges, loadTrainerSnapshot, type TrainerSnapshot } from "../../data/trainerData";
import { localDate, yearMonth } from "../../domain/dates";
import { plansMissingCharge } from "../../domain/payments";
import { CACHE_TTL_MS } from "../../domain/readWindows";
import { browserTimeZone } from "../_shared/browserTimeZone";

// GOALS.md §23g: loads what the trainer's screens show. With `ensureCharges`, it first creates this
// month's charge for every active billing plan that doesn't have one yet (idempotent, see
// ensureMonthlyCharges) — so opening the dashboard is what keeps mensalidades current.
//
// GOALS.md §38b: the data is loaded once per browser session and shared by every /app page through
// <TrainerDataProvider> (app/app/layout.tsx) — memory only, gone when the area unmounts (sign-out). A page
// gets it from memory while it is younger than CACHE_TTL_MS and still "today"; after that, and after every
// reload() (each write calls it), the snapshot is refreshed incrementally (data/trainerData.ts) instead of
// read again from scratch.

export type TrainerData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      snapshot: TrainerSnapshot;
      chargesCreated: number;
      /** "Today" as of this load, in the trainer's zone — one value for every figure on screen. */
      today: string;
      /** The instant of this load (epoch ms) that `today` was taken from. */
      now: number;
      timeZone: string;
    };

function describe(error: unknown): string {
  if (error instanceof FirebaseError && error.code === "permission-denied") {
    // The one failure with a known cause at this stage: rules that predate §23d are live.
    return "Sem permissão para ler os dados. As regras do Firestore mais recentes (GOALS.md §23d) já foram publicadas?";
  }
  return "Não foi possível carregar os dados. Verifique a conexão.";
}

const LOADING: TrainerData = { status: "loading" };

class TrainerDataStore {
  private state: TrainerData = LOADING;
  private owner: string | null = null;
  /** The last snapshot read, kept through "loading" and errors so the next load can be incremental. */
  private last: TrainerSnapshot | undefined;
  private ticket = 0;
  private running = false;
  /** Set by invalidate(): the next page that asks reads again, without a "Carregando…" in between. */
  private stale = false;
  private queued: { ensureCharges: boolean; force: boolean } | null = null;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  ownedBy(trainerId: string): boolean {
    return this.owner === trainerId;
  }

  private set(next: TrainerData) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  /** Whether the data in memory can serve a page as it is. */
  private isFresh(ensure: boolean): boolean {
    if (this.state.status !== "ready" || this.stale) return false;
    const { snapshot, today, timeZone } = this.state;
    const now = Date.now();
    if (now - snapshot.loadedAt > CACHE_TTL_MS || localDate(now, timeZone) !== today) return false;
    return !ensure || plansMissingCharge(snapshot.plans, snapshot.payments, yearMonth(today), timeZone).length === 0;
  }

  /** A page wants the data: from memory while fresh, refreshed when stale, loaded when absent. */
  request(trainerId: string, ensure: boolean, force = false): void {
    if (this.owner !== trainerId) {
      this.owner = trainerId;
      this.last = undefined;
      this.ticket++;
      this.running = false;
      this.queued = null;
      this.set(LOADING);
      force = true;
    }
    if (!force && this.isFresh(ensure)) {
      // The "cobranças geradas agora" notice belongs to the visit that created them, not to every later page.
      if (this.state.status === "ready" && this.state.chargesCreated > 0) this.set({ ...this.state, chargesCreated: 0 });
      return;
    }
    if (this.running) {
      this.queued = { ensureCharges: ensure || (this.queued?.ensureCharges ?? false), force: force || (this.queued?.force ?? false) };
      return;
    }
    void this.run(trainerId, ensure);
  }

  /** After a write that moves to another page (a new aluno, say): that page reads the refreshed data. */
  invalidate(): void {
    this.stale = true;
  }

  /** After a write: show "Carregando…" as before, then the refreshed data. */
  reload(trainerId: string, ensure: boolean): void {
    if (this.owner === trainerId) this.set(LOADING);
    this.request(trainerId, ensure, true);
  }

  private async run(trainerId: string, ensure: boolean): Promise<void> {
    const ticket = ++this.ticket;
    this.running = true;
    const stale = this.stale;
    this.stale = false;
    try {
      const { db } = getFirebase();
      const now = Date.now();
      const timeZone = browserTimeZone();
      const today = localDate(now, timeZone);
      // A snapshot still fresh (another page asked only for the charges) is reused as it is.
      const current = !stale && this.state.status === "ready" && now - this.state.snapshot.loadedAt <= CACHE_TTL_MS && this.state.today === today
        ? this.state.snapshot
        : await loadTrainerSnapshot(db, trainerId, now, this.last);
      const { snapshot, chargesCreated } = ensure
        ? await ensureCharges(db, trainerId, current, yearMonth(today), now, timeZone)
        : { snapshot: current, chargesCreated: 0 };
      if (ticket !== this.ticket) return;
      this.last = snapshot;
      this.set({ status: "ready", snapshot, chargesCreated, today, now, timeZone });
    } catch (error) {
      if (ticket === this.ticket) this.set({ status: "error", message: describe(error) });
    } finally {
      if (ticket === this.ticket) {
        this.running = false;
        const queued = this.queued;
        this.queued = null;
        if (queued) this.request(trainerId, queued.ensureCharges, queued.force);
      }
    }
  }
}

const StoreContext = createContext<TrainerDataStore | null>(null);

/** One store per mounted /app area — app/app/layout.tsx wraps the pages in it. */
export function TrainerDataProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => new TrainerDataStore(), []);
  return createElement(StoreContext.Provider, { value: store }, children);
}

export function useTrainerData(trainerId: string, { ensureCharges = false } = {}) {
  const store = useContext(StoreContext);
  if (store === null) throw new Error("useTrainerData() must be used inside <TrainerDataProvider>.");
  const state = useSyncExternalStore(store.subscribe, store.getState, () => LOADING);

  useEffect(() => {
    store.request(trainerId, ensureCharges);
  }, [store, trainerId, ensureCharges]);

  const reload = useCallback(() => store.reload(trainerId, ensureCharges), [store, trainerId, ensureCharges]);

  // Another trainer's data (a sign-in in the same tab) is never shown, not even for one render.
  return { data: store.ownedBy(trainerId) ? state : LOADING, reload };
}

/** For a page that writes and then moves on without reading the data itself (alunos/novo). */
export function useTrainerDataInvalidation(): () => void {
  const store = useContext(StoreContext);
  return useCallback(() => store?.invalidate(), [store]);
}
