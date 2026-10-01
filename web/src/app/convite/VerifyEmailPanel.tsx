"use client";

import { useEffect, useRef, useState } from "react";
import { RESEND_COOLDOWN_SECONDS, resendWaitSeconds } from "../../domain/emailVerification";
import { ConfirmDialog } from "../_shared/ConfirmDialog";
import { SignOutButton } from "../SignOutButton";

// GOALS.md §27e — "Confirme seu e-mail": shown to a signed-in account whose address is not verified
// yet. The invite can only be claimed after the link in the mail was opened (firestore.rules refuse
// it before that), so this panel is the whole waiting room: resend, "Já confirmei", and a way out
// for a mistyped address.

export function VerifyEmailPanel({
  email,
  lastSentAt,
  notice,
  error,
  onSend,
  onConfirmed,
  onWrongEmail,
}: {
  email: string | null;
  /** When the last link went out from this page; null if none was sent from here yet. */
  lastSentAt: number | null;
  notice: string | null;
  error: string | null;
  onSend: () => void;
  onConfirmed: () => void;
  onWrongEmail: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [askWrongEmail, setAskWrongEmail] = useState(false);
  // `now` only ticks during a countdown, so right after a send it can be older than lastSentAt.
  const wait = Math.min(resendWaitSeconds(lastSentAt, now), RESEND_COOLDOWN_SECONDS);

  useEffect(() => heading.current?.focus(), []);

  // Tick only while the Reenviar button is counting down.
  useEffect(() => {
    if (wait === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  return (
    <section aria-labelledby="verify-title">
      <h2 id="verify-title" ref={heading} tabIndex={-1}>
        Confirme seu e-mail
      </h2>
      {lastSentAt !== null ? (
        <p>
          Enviamos um link para <strong>{email}</strong>. Abra o e-mail e clique no link para confirmar que o
          endereço é seu — depois volte aqui.
        </p>
      ) : (
        <p>
          Antes de aceitar o convite, confirme que <strong>{email}</strong> é seu: toque em “Enviar e-mail de
          confirmação” e clique no link que chegar nesse endereço.
        </p>
      )}
      <p className="subtle">Não achou? Veja a caixa de spam ou de promoções.</p>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <p>
        <button type="button" className="button-primary button-block" onClick={onConfirmed}>
          Já confirmei
        </button>
      </p>
      <p>
        <button type="button" className="button-block" disabled={wait > 0} onClick={onSend}>
          {lastSentAt === null
            ? "Enviar e-mail de confirmação"
            : wait > 0
              ? `Reenviar e-mail (${wait} s)`
              : "Reenviar e-mail"}
        </button>
      </p>
      <p>
        <button type="button" className="link-button" onClick={() => setAskWrongEmail(true)}>
          Usei o e-mail errado
        </button>{" "}
        · <SignOutButton className="link-button" />
      </p>
      <ConfirmDialog
        open={askWrongEmail}
        title="Começar de novo com outro e-mail?"
        yesLabel="Sim, apagar esta conta"
        onYes={() => {
          setAskWrongEmail(false);
          onWrongEmail();
        }}
        onNo={() => setAskWrongEmail(false)}
      >
        <p>
          A conta criada com <strong>{email}</strong> ainda não foi confirmada e será apagada. Você volta ao
          formulário e cria outra com o e-mail certo.
        </p>
      </ConfirmDialog>
    </section>
  );
}
