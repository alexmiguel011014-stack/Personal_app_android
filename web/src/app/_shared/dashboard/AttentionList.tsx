import Link from "next/link";
import type { AttentionItem } from "../../../domain/attention";
import { Avatar } from "../Avatar";

// GOALS.md §37b — "Precisa de você": who needs the viewer, most urgent first, one action per row. The first few rows show;
// the rest fold into a <details>. The reason is always a word (the chip's colour only echoes it).

const TONES: Record<string, "alert" | "warning" | "info"> = {
  atraso: "alert",
  cobranca: "alert",
  solicitacao: "info",
};

export const ATTENTION_SHOWN = 6;

function Rows({ items }: { items: readonly AttentionItem[] }) {
  return (
    <ul className="attention-list">
      {items.map((item) => (
        <li key={item.id} className="attention-row">
          <Avatar name={item.name} />
          <div className="attention-main">
            <p className="attention-name">{item.name}</p>
            <p className="attention-detail">{item.detail}</p>
          </div>
          <span className="attention-reason" data-tone={TONES[item.kind] ?? "warning"}>
            {item.reason}
          </span>
          {item.href && (
            <Link className="button attention-action" href={item.href} aria-label={`${item.actionLabel}: ${item.name}`}>
              {item.actionLabel}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function AttentionList({
  id,
  title,
  items,
  empty,
  shown = ATTENTION_SHOWN,
}: {
  id: string;
  title: string;
  items: readonly AttentionItem[];
  empty: string;
  shown?: number;
}) {
  const rest = items.slice(shown);
  return (
    <section className="panel attention-panel" aria-labelledby={id}>
      <div className="section-heading">
        <h2 id={id}>{title}</h2>
        {items.length > 0 && <span className="quiet-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <p className="attention-empty">{empty}</p>
      ) : (
        <>
          <Rows items={items.slice(0, shown)} />
          {rest.length > 0 && (
            <details className="attention-more">
              <summary>
                Ver mais {rest.length} <span aria-hidden="true">+</span>
              </summary>
              <Rows items={rest} />
            </details>
          )}
        </>
      )}
    </section>
  );
}
