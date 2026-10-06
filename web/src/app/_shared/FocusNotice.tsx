"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A status or error message that takes keyboard focus only when nothing else has it.
 *
 * Pressing an action button that then goes away (the form closes, the invoice is paid, the editor is dismissed) leaves
 * focus on <body>, and the next Tab starts again from the top of the page. Here the message — which is announced anyway —
 * becomes the place focus lands, so a keyboard or screen-reader user continues from the result. When focus is still on a
 * control (the button stayed), it is left alone: a message that appears must not steal it.
 */
export function FocusNotice({ role = "status", className, children }: { role?: "status" | "alert"; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) ref.current?.focus();
  }, [children]);
  return <p ref={ref} role={role} tabIndex={-1} className={className}>{children}</p>;
}
