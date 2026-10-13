import Link from "next/link";
import type { ReactNode } from "react";

// GOALS.md §37b — one headline figure of a dashboard: what it is, the number, how it moved (in words), and optionally a
// small chart. With `href` the whole card is the link (the label carries it and stretches over the card), so a chart
// inside never sits inside an anchor.

export type ChangeTone = "good" | "bad" | "neutral";

export function KpiGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kpi-grid" role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  change,
  href,
  children,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** How it moved, already written ("+2 vs. 7 dias antes"); `tone` only colours it — the words carry the meaning. */
  change?: { text: string; tone: ChangeTone };
  href?: string;
  children?: ReactNode;
}) {
  return (
    <article className="kpi">
      <p className="kpi-label">
        {href ? (
          <Link className="kpi-stretch" href={href}>
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <p className="kpi-value">{value}</p>
      {change && (
        <p className="kpi-change" data-tone={change.tone}>
          {change.text}
        </p>
      )}
      {sub && <p className="kpi-sub">{sub}</p>}
      {children}
    </article>
  );
}
