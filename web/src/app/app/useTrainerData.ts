"use client";

import { FirebaseError } from "firebase/app";
import { useCallback, useEffect, useState } from "react";
import { getFirebase } from "../../data/firebase";
import { loadTrainerSnapshot, loadTrainerView, type TrainerSnapshot } from "../../data/trainerData";
import { localDate, yearMonth } from "../../domain/dates";
import { browserTimeZone } from "../_shared/browserTimeZone";

// GOALS.md §23g: loads what the trainer's screens show. With `ensureCharges`, it first creates this
// month's charge for every active billing plan that doesn't have one yet (idempotent, see
// ensureMonthlyCharges) — so opening the dashboard is what keeps mensalidades current.

export type TrainerData =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      snapshot: TrainerSnapshot;
      chargesCreated: number;
      /** "Today" as of this load, in the trainer's zone — one value for every figure on screen. */
      today: string;
      timeZone: string;
    };

function describe(error: unknown): string {
  if (error instanceof FirebaseError && error.code === "permission-denied") {
    // The one failure with a known cause at this stage: rules that predate §23d are live.
    return "Sem permissão para ler os dados. As regras do Firestore mais recentes (GOALS.md §23d) já foram publicadas?";
  }
  return "Não foi possível carregar os dados. Verifique a conexão.";
}

export function useTrainerData(trainerId: string, { ensureCharges = false } = {}) {
  const [data, setData] = useState<TrainerData>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { db } = getFirebase();
        const now = Date.now();
        const timeZone = browserTimeZone();
        const today = localDate(now, timeZone);
        const { snapshot, chargesCreated } = ensureCharges
          ? await loadTrainerView(db, trainerId, yearMonth(today), now, timeZone)
          : { snapshot: await loadTrainerSnapshot(db, trainerId), chargesCreated: 0 };
        if (!cancelled) setData({ status: "ready", snapshot, chargesCreated, today, timeZone });
      } catch (error) {
        if (!cancelled) setData({ status: "error", message: describe(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trainerId, ensureCharges, version]);

  const reload = useCallback(() => {
    setData({ status: "loading" });
    setVersion((v) => v + 1);
  }, []);

  return { data, reload };
}
