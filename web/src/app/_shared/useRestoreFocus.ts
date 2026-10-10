"use client";

import { useEffect, useState } from "react";

/**
 * For a dialog that is mounted only while open: remembers what had focus when it opened and, when it unmounts, puts
 * focus back there if it was dropped on <body> (a native <dialog>.close() does this by itself; unmounting does not).
 * A message that then takes focus (FocusNotice) still can: it only steals focus from <body>, and this hands it a control.
 */
export function useRestoreFocus(): void {
  const [origin] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.activeElement));
  useEffect(() => () => {
    if (origin instanceof HTMLElement && origin.isConnected && document.activeElement === document.body) origin.focus();
  }, [origin]);
}
