"use client";

import { useEffect, useRef, type ReactNode } from "react";

// A yes/no question in a modal box — the native <dialog>, so focus is trapped, the page behind is
// inert and Escape closes it, with no library. "Não" has the initial focus and is also what Escape
// and the backdrop mean: a stray tap never answers "Sim".

export function ConfirmDialog({
  open,
  title,
  children,
  yesLabel = "Sim",
  noLabel = "Não",
  onYes,
  onNo,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  yesLabel?: string;
  noLabel?: string;
  onYes: () => void;
  onNo: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby="confirm-title"
      // Escape: answer "Não" ourselves instead of letting the dialog close behind React's back.
      onCancel={(event) => {
        event.preventDefault();
        onNo();
      }}
      // A click on the backdrop lands on the <dialog> element itself (the content sits in a child).
      onClick={(event) => {
        if (event.target === event.currentTarget) onNo();
      }}
    >
      <div className="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        <div className="confirm-text">{children}</div>
        <div className="confirm-actions">
          <button type="button" autoFocus onClick={onNo}>
            {noLabel}
          </button>
          <button type="button" className="button-primary" onClick={onYes}>
            {yesLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
