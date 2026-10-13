// GOALS.md §37 — one row of a "Precisa de você" list, the same shape on the trainer's home and the ADM's overview.

export interface AttentionItem<Kind extends string = string> {
  id: string;
  kind: Kind;
  name: string;
  /** The reason, in words (never colour alone). */
  reason: string;
  detail: string;
  /** Where the action goes; null when there is nothing left to open. */
  href: string | null;
  actionLabel: string;
}
