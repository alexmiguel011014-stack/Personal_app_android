import type { StorageLike } from "../../domain/formDraft";

// GOALS.md §38c: the one place the site touches the browser's localStorage for a draft. It can be missing or throw
// (a private window, blocked site data), so the answer is "no storage", never an exception.

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
