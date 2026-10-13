import Link from "next/link";
import { progressRatio, sparkPoints } from "../../../domain/chartText";

// GOALS.md §37b — the dashboards' small charts, drawn by hand (no chart library). Each one is `role="img"` with a sentence
// from `domain/chartText.ts` as its name, so what a screen reader hears states the series, the trend and the extremes. Bars
// and the progress/stacked bars are HTML (their numbers are real, readable text); only the sparkline's line is SVG.

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** The number shown above the bar (short: it must fit a phone column). */
  valueLabel: string;
}

export function BarChart({ label, bars }: { label: string; bars: readonly Bar[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <figure className="bar-chart" role="img" aria-label={label}>
      {bars.map((bar, index) => (
        <div key={bar.key} className="bar-col" data-current={index === bars.length - 1 ? "" : undefined}>
          <span className="bar-value">{bar.valueLabel}</span>
          <span className="bar-track">
            <span className="bar-fill" data-empty={bar.value === 0 ? "" : undefined} style={{ height: `${(bar.value / max) * 100}%` }} />
          </span>
          <span className="bar-label">{bar.label}</span>
        </div>
      ))}
    </figure>
  );
}

export function Sparkline({ label, values }: { label: string; values: readonly number[] }) {
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label={label}>
      <polyline points={sparkPoints(values)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function ProgressBar({ label, part, total }: { label: string; part: number; total: number }) {
  return (
    <div className="progress" role="img" aria-label={label}>
      <span style={{ width: `${progressRatio(part, total) * 100}%` }} />
    </div>
  );
}

export type SegmentTone = "success" | "warning" | "alert" | "info" | "muted";

export interface Segment {
  key: string;
  name: string;
  count: number;
  tone: SegmentTone;
  href?: string;
}

/** One bar split by count, with a legend that spells every segment out (and links it when it has somewhere to go). */
export function StackedBar({ label, segments }: { label: string; segments: readonly Segment[] }) {
  return (
    <div className="stack">
      <div className="stack-bar" role="img" aria-label={label}>
        {segments.map((segment) => (
          <span key={segment.key} data-tone={segment.tone} style={{ flexGrow: segment.count }} />
        ))}
      </div>
      <ul className="stack-legend">
        {segments.map((segment) => (
          <li key={segment.key}>
            <span className="swatch" data-tone={segment.tone} aria-hidden="true" />
            {segment.href ? <Link href={segment.href}>{segment.name}</Link> : <span>{segment.name}</span>}
            <strong>{segment.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
