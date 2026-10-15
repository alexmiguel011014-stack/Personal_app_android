"use client";

import Image from "next/image";
import { useState, useSyncExternalStore } from "react";
import {
  GUIDES,
  INSTALLED_NOTICE,
  INSTALL_INTRO,
  SCREENS_MAY_DIFFER,
  detectPlatform,
  emphasisRuns,
  isStandaloneDisplay,
  type GuideStep,
  type Platform,
} from "../../domain/installGuide";
import { SHOTS } from "./installGuide/images";
import { SettingsFrame } from "./SettingsFrame";

// GOALS.md §40d: "Instalar no celular" — how to put the site on the home screen of an iPhone or an Android phone. The
// words and steps are data in domain/installGuide.ts; this file only shows them. It reads two things from the browser
// without an effect (so the exported page and the first client render agree): which phone this is, to open that guide
// first, and whether the page already runs as an installed app, to say so.

const noSubscription = () => () => {};

function subscribeToDisplayMode(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readStandalone(): boolean {
  return isStandaloneDisplay(window.matchMedia("(display-mode: standalone)").matches, (navigator as Navigator & { standalone?: boolean }).standalone);
}

function Emphasis({ text }: { text: string }) {
  return (
    <>
      {emphasisRuns(text).map((run, index) => (run.strong ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>))}
    </>
  );
}

function Step({ step, number }: { step: GuideStep; number: number }) {
  const shot = step.shot === undefined ? undefined : SHOTS[step.shot];
  const ring = step.highlight;
  return (
    <li className="install-step">
      <span className="install-step-number" aria-hidden="true">
        {number}
      </span>
      <div>
        <h3>{step.title}</h3>
        <p>
          <Emphasis text={step.body} />
        </p>
      </div>
      {shot !== undefined && (
        <figure className="install-shot">
          <div className="install-shot-frame">
            <Image src={shot.image} alt={shot.alt} unoptimized sizes="280px" />
            {ring !== undefined && (
              <span className="install-ring" aria-hidden="true" style={{ left: `${ring.x}%`, top: `${ring.y}%`, width: `${ring.w}%`, height: `${ring.h}%` }} />
            )}
          </div>
        </figure>
      )}
    </li>
  );
}

function Guide({ platform }: { platform: Platform }) {
  const guide = GUIDES[platform];
  return (
    <>
      <section className="panel" aria-labelledby={`install-${platform}-title`}>
        <h2 id={`install-${platform}-title`}>
          No {guide.label}, pelo {guide.browser}
        </h2>
        <ol className="install-steps">
          {guide.steps.map((step, index) => (
            <Step key={step.id} step={step} number={index + 1} />
          ))}
        </ol>
        <p className="install-note">
          {guide.captured !== undefined && `Telas do ${guide.captured}. `}
          {SCREENS_MAY_DIFFER}
        </p>
      </section>
      <section className="panel install-problems" aria-labelledby={`install-${platform}-problems`}>
        <h2 id={`install-${platform}-problems`}>Problemas comuns</h2>
        {guide.problems.map((problem) => (
          <details key={problem.id}>
            <summary>{problem.question}</summary>
            <p>
              <Emphasis text={problem.answer} />
            </p>
          </details>
        ))}
      </section>
    </>
  );
}

export function InstallGuide() {
  const detected = useSyncExternalStore(noSubscription, () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints), () => "other" as const);
  const installed = useSyncExternalStore(subscribeToDisplayMode, readStandalone, () => false);
  const [chosen, setChosen] = useState<Platform | null>(null);
  const platform: Platform = chosen ?? (detected === "android" ? "android" : "ios");

  return (
    <>
      <section className="panel">
        <p className="install-intro">{INSTALL_INTRO}</p>
        {installed && <p className="install-installed">{INSTALLED_NOTICE}</p>}
        <div className="install-toggle" role="group" aria-label="Tipo de celular">
          {(Object.keys(GUIDES) as Platform[]).map((key) => (
            <button key={key} type="button" aria-pressed={platform === key} onClick={() => setChosen(key)}>
              {GUIDES[key].label}
            </button>
          ))}
        </div>
      </section>
      <Guide key={platform} platform={platform} />
    </>
  );
}

export function InstallGuidePage({ eyebrow }: { eyebrow?: string }) {
  return (
    <SettingsFrame eyebrow={eyebrow} subtitle="Coloque o ALLU na tela inicial do celular, como um aplicativo.">
      <InstallGuide />
    </SettingsFrame>
  );
}
