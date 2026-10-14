"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import {
  REST_STEP_SECONDS,
  clock,
  isRestOver,
  remainingSeconds,
} from "../../../domain/restTimer";
import { alertRestOver } from "./restAlert";

// GOALS.md §38e (D8): the rest countdown, a chip above "Salvar sessão". It shows the time left, moves the end by 15 s
// either way, and can be cancelled; at the end it beeps and vibrates and says so, then waits to be closed. The time is
// always computed from the end instant (domain/restTimer.ts), so a tab put to sleep shows the right number on waking.

export interface RestTimer {
  exercise: string;
  startedAt: number;
  endsAt: number;
}

export function RestTimerChip({
  timer,
  audio,
  onAdjust,
  onClose,
}: {
  timer: RestTimer;
  audio: MutableRefObject<AudioContext | null>;
  onAdjust: (deltaSeconds: number) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const over = isRestOver(timer.endsAt, now);

  useEffect(() => {
    if (over) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [over, timer.endsAt]);

  useEffect(() => {
    if (over) alertRestOver(audio.current);
  }, [over, audio]);

  return (
    <div className={`rest-chip${over ? " is-over" : ""}`}>
      <span className="rest-chip-text">
        <strong>
          {over
            ? "Descanso terminou"
            : clock(remainingSeconds(timer.endsAt, now))}
        </strong>
        <small>{timer.exercise}</small>
      </span>
      {!over && (
        <>
          <button
            type="button"
            aria-label="Menos 15 segundos"
            onClick={() => onAdjust(-REST_STEP_SECONDS)}
          >
            −15 s
          </button>
          <button
            type="button"
            aria-label="Mais 15 segundos"
            onClick={() => onAdjust(REST_STEP_SECONDS)}
          >
            +15 s
          </button>
        </>
      )}
      <button type="button" onClick={onClose}>
        {over ? "Fechar" : "Cancelar"}
      </button>
      <span className="visually-hidden" role="status">
        {over ? "Descanso terminou." : ""}
      </span>
    </div>
  );
}
