"use client";

import { useState, type FormEvent } from "react";
import { adjustCharge, markPaid, undoPayment } from "../../data/billing";
import { getFirebase } from "../../data/firebase";
import { METHOD_LABELS, STATUS_LABELS, paidAtFor, parseAdjustment } from "../../domain/billing";
import { formatDate, localDate } from "../../domain/dates";
import { dueDateFor, formatCents, paymentStatus, type Payment, type PaymentMethod } from "../../domain/payments";

// GOALS.md §23g: charges and what the trainer does with them — mark paid (how, and on which day),
// undo a mistaken "paid", adjust an unpaid charge's amount or due date. Shared by the Mensalidades
// page and a student's page. A gateway-owned charge (level 2) is read-only here, as in the rules.

const METHODS = Object.keys(METHOD_LABELS) as PaymentMethod[];

export function ChargesTable({
  caption,
  charges,
  nameOf,
  today,
  timeZone,
  onChanged,
}: {
  caption: string;
  charges: readonly Payment[];
  /** Given when the table spans students: adds a student column. */
  nameOf?: (charge: Payment) => string;
  today: string;
  timeZone: string;
  onChanged: () => void;
}) {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {nameOf && <th scope="col">Aluno</th>}
          <th scope="col">Vencimento</th>
          <th scope="col">Valor</th>
          <th scope="col">Situação</th>
          <th scope="col">Ações</th>
        </tr>
      </thead>
      <tbody>
        {charges.map((charge) => (
          <ChargeRow
            key={charge.id}
            charge={charge}
            name={nameOf?.(charge)}
            today={today}
            timeZone={timeZone}
            onChanged={onChanged}
          />
        ))}
      </tbody>
    </table>
  );
}

function ChargeRow({
  charge,
  name,
  today,
  timeZone,
  onChanged,
}: {
  charge: Payment;
  name: string | undefined;
  today: string;
  timeZone: string;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"idle" | "paying" | "adjusting">("idle");
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState(charge.note ?? "");
  const [amount, setAmount] = useState(formatCents(charge.amountCents).replace(/^R\$\s*/, ""));
  const [dueDate, setDueDate] = useState(charge.dueDate);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const month = charge.dueDate.slice(0, 7);
  const label = `${name ? `${name}, ` : ""}vencimento ${formatDate(charge.dueDate)}`;

  async function run(write: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await write();
      setMode("idle");
      onChanged();
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const db = () => getFirebase().db;

  function pay(event: FormEvent) {
    event.preventDefault();
    const result = paidAtFor(paidOn, today, Date.now());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const trimmed = note.trim();
    void run(() => markPaid(db(), charge.id, result.paidAt, method, trimmed === "" ? null : trimmed));
  }

  function adjust(event: FormEvent) {
    event.preventDefault();
    const result = parseAdjustment(charge, amount, dueDate);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    void run(() => adjustCharge(db(), charge.id, result.amountCents, result.dueDate));
  }

  function undo() {
    if (window.confirm(`Desfazer o pagamento (${label})?`)) void run(() => undoPayment(db(), charge.id));
  }

  let actions;
  if (charge.source !== "manual") {
    actions = "Gerenciada pelo meio de pagamento";
  } else if (charge.paidAt !== null) {
    actions = (
      <button type="button" disabled={busy} aria-label={`Desfazer pagamento: ${label}`} onClick={undo}>
        Desfazer pagamento
      </button>
    );
  } else if (mode === "paying") {
    actions = (
      <form onSubmit={pay}>
        <label>
          Forma{" "}
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </label>{" "}
        <label>
          Pago em <input type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>{" "}
        <label>
          Observação <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>{" "}
        <button type="submit" disabled={busy}>
          Confirmar pagamento
        </button>{" "}
        <button type="button" onClick={() => setMode("idle")}>
          Cancelar
        </button>
      </form>
    );
  } else if (mode === "adjusting") {
    actions = (
      <form onSubmit={adjust}>
        <label>
          Valor (R$) <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>{" "}
        <label>
          Vencimento{" "}
          <input
            type="date"
            min={`${month}-01`}
            max={dueDateFor(month, 31)}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </label>{" "}
        <button type="submit" disabled={busy}>
          Salvar
        </button>{" "}
        <button type="button" onClick={() => setMode("idle")}>
          Cancelar
        </button>
      </form>
    );
  } else {
    actions = (
      <>
        <button type="button" aria-label={`Marcar como pago: ${label}`} onClick={() => setMode("paying")}>
          Marcar como pago
        </button>{" "}
        <button type="button" aria-label={`Ajustar: ${label}`} onClick={() => setMode("adjusting")}>
          Ajustar
        </button>
      </>
    );
  }

  const paidDetail =
    charge.paidAt === null
      ? ""
      : ` em ${formatDate(localDate(charge.paidAt, timeZone))}${charge.method ? ` (${METHOD_LABELS[charge.method]})` : ""}`;
  return (
    <tr>
      {name !== undefined && <td>{name}</td>}
      <td>{formatDate(charge.dueDate)}</td>
      <td>{formatCents(charge.amountCents)}</td>
      <td>
        {STATUS_LABELS[paymentStatus(charge, today)]}
        {paidDetail}
        {charge.note && ` — ${charge.note}`}
      </td>
      <td>
        {actions}
        {error && <p role="alert">{error}</p>}
      </td>
    </tr>
  );
}
