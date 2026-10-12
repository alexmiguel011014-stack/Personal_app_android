import { describe, expect, it } from "vitest";
import type { TrainerUser } from "./converters";
import { buildMensalidadeRows, mensalidadeCounts, type MensalidadeData } from "./mensalidades";
import type { PlatformPayment, PlatformSubscription } from "./platformSubscriptions";
import { endOfDayDeadline } from "../domain/mensalidades";

// GOALS.md §36a — a golden pin of the ADM list for a fixed fixture. The shared engine (§36b–§36d) must leave every one
// of these rows exactly as they are: this is the "behaviour does not move" proof for the platform side.
const NOW = Date.parse("2026-10-09T15:00:00-03:00");
const day = (date: string) => endOfDayDeadline(date);

function trainer(id: string, name: string, billingStatus: TrainerUser["platformBillingStatus"], until: number | null, accessStatus: "active" | "suspended" = "active"): TrainerUser {
  return { id, role: "TRAINER", name, email: `${id}@example.test`, createdAt: 0, createdBy: null, accessStatus, suspendedAt: null, suspendedReason: null, platformBillingStatus: billingStatus, platformBillingUntil: until };
}

function subscription(trainerUid: string, mode: "trial" | "paid", planName: string | undefined): PlatformSubscription {
  return {
    trainerUid, mode, overrides: {}, chargeDuringTrial: false, effectiveAt: 0, trialStartedAt: null, trialEndsAt: null, currentInvoiceId: null, updatedAt: 0,
    terms: { monthlyBaseCents: 3_000, includedStudentSeats: 10, extraStudentMonthlyCents: 275, maxActiveInviteCodes: 15, trialDurationDays: 3, snapshotVersion: 1, templateId: "base", templateVersion: 1, ...(planName ? { planName } : {}) },
  };
}

function payment(id: string, trainerUid: string, paidAt: number, voidedAt: number | null = null): PlatformPayment {
  return {
    id, trainerUid, paidAt, paidBy: "adm", amountCents: 3_000, paymentReference: null, newUntil: 0, paidThroughDate: "2026-11-09", previousUntil: null,
    previousStatus: "pending", previousMode: "paid", planName: "Plano Base", templateId: "base", templateVersion: 1, snapshotVersion: 1, voidedAt, voidedBy: voidedAt ? "adm" : null, lastAuditId: null,
  };
}

const data: MensalidadeData = {
  trainers: [
    trainer("late", "Atrasado", "current", day("2026-10-08")),
    trainer("today", "Vence hoje", "current", day("2026-10-09")),
    trainer("soon", "Em breve", "current", day("2026-10-12")),
    trainer("ok", "Em dia", "current", day("2026-11-20")),
    trainer("trial", "Em teste", "trial", day("2026-10-12")),
    trainer("wait", "Aguardando", "pending", null),
    trainer("none", "Sem plano", "pending", null),
    trainer("old", "Conta antiga", undefined, null, "suspended"),
    trainer("blocked", "Bloqueado", "blocked", null),
  ],
  subscriptions: new Map([
    ["late", subscription("late", "paid", "Plano Base")],
    ["today", subscription("today", "paid", "Plano Base")],
    ["soon", subscription("soon", "paid", undefined)], // a snapshot from before §35: no planName, read from the template
    ["ok", subscription("ok", "paid", "Plano Plus")],
    ["trial", subscription("trial", "trial", "Plano Base")],
    ["wait", subscription("wait", "paid", "Plano Base")],
    ["blocked", subscription("blocked", "paid", "Plano Base")],
  ]),
  templates: [{ id: "base", name: "Plano Base (modelo)", version: 1, monthlyBaseCents: 3_000, includedStudentSeats: 10, extraStudentMonthlyCents: 275, maxActiveInviteCodes: 15, trialDurationDays: 3 }],
  payments: [payment("p3", "ok", Date.parse("2026-10-05T10:00:00-03:00")), payment("p2", "ok", Date.parse("2026-09-05T10:00:00-03:00")), payment("p1", "late", 1, 2), payment("p0", "late", Date.parse("2026-09-08T10:00:00-03:00"))],
  paymentsUnavailable: false,
};

describe("the ADM list, pinned (§36a)", () => {
  const rows = buildMensalidadeRows(data, NOW);
  const pick = (id: string) => rows.find((row) => row.trainer.id === id)!;

  it("derives state, label inputs and plan name for every kind of account", () => {
    expect(rows.map((row) => [row.trainer.id, row.mensalidade.state, row.planName])).toEqual([
      ["late", "atrasado", "Plano Base"],
      ["today", "vence_breve", "Plano Base"],
      ["soon", "vence_breve", "Plano Base (modelo)"],
      ["ok", "em_dia", "Plano Plus"],
      ["trial", "teste", "Plano Base"],
      ["wait", "aguardando", "Plano Base"],
      ["none", "sem_plano", null],
      ["old", "sem_plano", null],
      ["blocked", "atrasado", "Plano Base"],
    ]);
  });

  it("counts, days and access agree with what the access gate lets in", () => {
    expect(mensalidadeCounts(rows)).toEqual({ sem_plano: 2, aguardando: 1, teste: 1, em_dia: 1, vence_breve: 2, atrasado: 2, pausado: 0 }); // `pausado` (aluno plans only) is the one additive key of §36
    expect(pick("late").mensalidade).toMatchObject({ daysLate: 1, accessOpen: false, expiresOn: "2026-10-08" });
    expect(pick("today").mensalidade).toMatchObject({ daysLeft: 0, accessOpen: true });
    expect(pick("trial").mensalidade).toMatchObject({ daysLeft: 3, accessOpen: true });
    expect(pick("old").mensalidade).toMatchObject({ accessOpen: true }); // a legacy account without billing fields stays open
    expect(pick("blocked").mensalidade).toMatchObject({ daysLate: null, accessOpen: false });
  });

  it("keeps the last payment that was not voided, newest first", () => {
    expect(pick("ok").lastPayment?.id).toBe("p3");
    expect(pick("late").lastPayment?.id).toBe("p0"); // p1 is voided
    expect(pick("trial").lastPayment).toBeNull();
  });
});
