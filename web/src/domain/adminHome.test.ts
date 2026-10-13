import { describe, expect, it } from "vitest";
import type { AuditEntry, TrainerActivity, TrainerStats, TrainerUser } from "../data/converters";
import type { PlatformPayment, PlatformSubscription } from "../data/billing/platformScope";
import { activeTrainerWindows, adminAttention, adminKpis, auditRows, revenueByMonth, staleSummaryCount, stateSegments, studentChargeTotals, usageRanking, platformRows, type AdminHomeInput } from "./adminHome";

const SP = "America/Sao_Paulo";
const NOW = Date.parse("2026-10-12T12:00:00-03:00");
const TODAY = "2026-10-12";
const DAY = 86_400_000;
const at = (iso: string) => Date.parse(`${iso}T12:00:00-03:00`);

function trainer(id: string, overrides: Partial<TrainerUser> = {}): TrainerUser {
  return { id, role: "TRAINER", name: id.toUpperCase(), email: `${id}@x.dev`, createdAt: 0, createdBy: null, accessStatus: "active", suspendedAt: null, suspendedReason: null, ...overrides };
}

function subscription(trainerUid: string, monthlyBaseCents: number, planName = "Plano Base"): PlatformSubscription {
  return {
    trainerUid, mode: "paid", overrides: {}, chargeDuringTrial: false, effectiveAt: 0, trialStartedAt: null, trialEndsAt: null, currentInvoiceId: null, updatedAt: 0,
    terms: { monthlyBaseCents, includedStudentSeats: 2, extraStudentMonthlyCents: 1000, maxActiveInviteCodes: 5, trialDurationDays: 0, snapshotVersion: 1, templateId: "t", templateVersion: 1, planName },
  } as PlatformSubscription;
}

function payment(id: string, trainerUid: string, paidAt: number, amountCents: number, voided = false): PlatformPayment {
  return { id, trainerUid, paidAt, paidBy: "adm", amountCents, paymentReference: null, newUntil: 0, paidThroughDate: "", previousUntil: null, previousStatus: "current", previousMode: "paid", planName: "Plano Base", templateId: "t", templateVersion: 1, snapshotVersion: 1, voidedAt: voided ? paidAt + 1 : null, voidedBy: voided ? "adm" : null, lastAuditId: null };
}

function stats(trainerId: string, lastSeenAt: number | null, overrides: Partial<TrainerStats> = {}): TrainerStats {
  return { trainerId, updatedAt: NOW - DAY, lastSeenAt, students: { total: 0, linked: 0, pending: 0 }, sessions7d: 0, adherence28d: null, quiet: 0, pendingAssessments: 0, billing: { month: "2026-10", activePlans: 0, planCents: 0, expectedCents: 0, receivedCents: 0, overdueCents: 0 }, ...overrides };
}

function activity(trainerId: string, month: string, actions: number, activeDays: string[]): TrainerActivity {
  return { trainerId, month, updatedAt: 0, actions: { login: actions } as TrainerActivity["actions"], activeDays };
}

// Four personais: em dia (paid through 20 Oct), atrasado, em teste ending in 2 days, one with no plan.
const emDia = trainer("emdia", { platformBillingStatus: "current", platformBillingUntil: at("2026-10-30") });
const atrasado = trainer("atrasado", { platformBillingStatus: "current", platformBillingUntil: at("2026-10-07") });
const teste = trainer("teste", { platformBillingStatus: "trial", platformBillingUntil: at("2026-10-14") });
const semPlano = trainer("semplano");
const suspenso = trainer("suspenso", { accessStatus: "suspended", platformBillingStatus: "current", platformBillingUntil: at("2026-10-01") });

const baseInput: AdminHomeInput = {
  trainers: [emDia, atrasado, teste, semPlano, suspenso],
  stats: [stats("emdia", NOW - DAY), stats("atrasado", NOW - 2 * DAY), stats("teste", NOW - DAY), stats("semplano", NOW - 3 * DAY), stats("suspenso", NOW - DAY)],
  subscriptions: new Map([["emdia", subscription("emdia", 10000)], ["atrasado", subscription("atrasado", 20000)], ["teste", subscription("teste", 30000)], ["suspenso", subscription("suspenso", 5000)]]),
  payments: [payment("p1", "emdia", at("2026-10-02"), 10000), payment("p2", "atrasado", at("2026-10-03"), 99999, true), payment("p3", "emdia", at("2026-09-02"), 10000)],
  linkedByTrainer: new Map([["emdia", 4], ["atrasado", 1], ["teste", 0]]),
  activities: [],
  requests: 0,
};

describe("adminKpis", () => {
  it("counts received from payments not voided and expects the month's still-owed prices", () => {
    const { revenue } = adminKpis(baseInput, NOW, SP);
    // em dia: 2 extra seats × R$10 on top of R$100; paid R$100 this month; expiry 30 Oct → still owed this month: R$120 + 0
    // atrasado: expiry 7 Oct (this month) → owes R$200 + 0 extra; suspenso: expired 1 Oct → R$50 owed.
    expect(revenue?.receivedCents).toBe(10000);
    expect(revenue?.planCents).toBe(12000 + 20000 + 30000 + 5000);
    expect(revenue?.expectedCents).toBe(10000 + 12000 + 20000 + 5000);
  });

  it("never counts a voided payment", () => {
    const withVoid = adminKpis({ ...baseInput, payments: [payment("v", "emdia", at("2026-10-02"), 77700, true)] }, NOW, SP);
    expect(withVoid.revenue?.receivedCents).toBe(0);
  });

  it("splits personais into paying / trial / waiting / late / no plan", () => {
    expect(adminKpis(baseInput, NOW, SP).payers).toEqual({ paying: 1, trial: 1, waiting: 0, late: 2, noPlan: 1 });
  });

  it("says nothing it cannot know when the subscriptions or the ledger are unavailable", () => {
    const noSubs = adminKpis({ ...baseInput, subscriptions: null }, NOW, SP);
    expect(noSubs.revenue).toBeNull();
    expect(noSubs.payers).toBeNull();
    const noLedger = adminKpis({ ...baseInput, payments: null }, NOW, SP);
    expect(noLedger.revenue?.receivedCents).toBeNull();
    expect(noLedger.revenue?.expectedCents).toBeGreaterThan(0);
  });

  it("counts active personais in the last 7 days with access, and the linked students", () => {
    const kpis = adminKpis({ ...baseInput, stats: [stats("emdia", NOW - 8 * DAY), stats("atrasado", NOW - 2 * DAY), stats("suspenso", NOW - DAY)] }, NOW, SP);
    expect(kpis.active.current).toBe(1); // atrasado only: emdia is 8 days away, suspenso has no access
    expect(kpis.active.withAccess).toBe(4);
    expect(kpis.students).toBe(5);
  });

  it("a personal with no plan expects nothing", () => {
    const rows = platformRows(baseInput, NOW, SP)!;
    expect(rows.find((row) => row.trainer.id === "semplano")?.monthlyCents).toBeNull();
  });
});

describe("activeTrainerWindows", () => {
  it("counts each personal once per window, from activity documents that straddle two months", () => {
    const ids = new Set(["a", "b"]);
    const acts = [
      activity("a", "2026-10", 3, ["2026-10-12", "2026-10-11"]),
      activity("a", "2026-09", 1, ["2026-09-30"]),
      activity("b", "2026-09", 1, ["2026-09-30"]),
      activity("zz", "2026-10", 1, ["2026-10-12"]), // not in the set
    ];
    const windows = activeTrainerWindows(acts, ids, TODAY);
    expect(windows).toHaveLength(8);
    expect(windows.at(-1)).toMatchObject({ to: TODAY, count: 1 }); // 6–12 Oct: only a
    expect(windows.at(-2)?.count).toBe(2); // 29 Sep–5 Oct: a and b
  });
});

describe("revenueByMonth", () => {
  it("gives six months, oldest first, voided payments out, late-evening payments in their own month", () => {
    const payments = [
      payment("a", "x", Date.parse("2026-09-30T23:30:00-03:00"), 100),
      payment("b", "x", at("2026-10-02"), 200),
      payment("c", "x", at("2026-10-03"), 999, true),
    ];
    const series = revenueByMonth(payments, TODAY, SP);
    expect(series).toHaveLength(6);
    expect(series.at(-1)).toEqual({ month: "2026-10", cents: 200 });
    expect(series.at(-2)).toEqual({ month: "2026-09", cents: 100 });
    expect(series[0].month).toBe("2026-05");
  });
});

describe("stateSegments / usageRanking", () => {
  it("lists the states that exist, most urgent first, with words", () => {
    const rows = platformRows(baseInput, NOW, SP)!;
    expect(stateSegments(rows).map((s) => [s.name, s.count])).toEqual([["Em atraso", 2], ["Em teste", 1], ["Em dia", 1], ["Sem plano", 1]]);
  });

  it("ranks the last 30 days across two months and counts the idle", () => {
    const acts = [
      activity("emdia", "2026-10", 5, ["2026-10-10"]),
      activity("emdia", "2026-09", 4, ["2026-09-20"]),
      activity("atrasado", "2026-10", 20, ["2026-10-01", "2026-10-02"]),
      activity("suspenso", "2026-10", 50, ["2026-10-01"]),
      activity("teste", "2026-08", 99, ["2026-08-01"]), // outside the window
    ];
    const { rows, idle } = usageRanking({ trainers: baseInput.trainers, activities: acts }, NOW, SP);
    expect(rows.map((r) => [r.name, r.actions])).toEqual([["ATRASADO", 20], ["EMDIA", 9]]);
    expect(idle).toBe(2); // teste and semplano; the suspended one is not counted
  });
});

describe("adminAttention", () => {
  it("orders requests → late → trial ending, one row per personal, others folded into the detail", () => {
    const items = adminAttention({ ...baseInput, requests: 2 }, NOW, SP);
    expect(items.map((i) => i.kind)).toEqual(["solicitacao", "atraso", "teste"]);
    expect(items[0].name).toBe("2 solicitações de acesso");
    expect(items[1].name).toBe("ATRASADO");
    expect(items[1].detail).toContain("Em atraso há 5 dias");
    expect(items[1].href).toBe("/admin/personais/detalhe?id=atrasado");
    expect(items[2].detail).toContain("2 dias restantes");
  });

  it("leaves out suspended personais and a personal with no plan who is otherwise fine", () => {
    const names = adminAttention(baseInput, NOW, SP).map((i) => i.name);
    expect(names).not.toContain("SUSPENSO");
    expect(names).not.toContain("SEMPLANO");
  });

  it("flags a personal who never entered, and folds a second reason into 'Também'", () => {
    const input: AdminHomeInput = { ...baseInput, stats: baseInput.stats.filter((s) => s.trainerId !== "atrasado") };
    const late = adminAttention(input, NOW, SP).find((i) => i.id === "personal:atrasado")!;
    expect(late.reason).toBe("Mensalidade em atraso");
    expect(late.detail).toContain("Também: nunca entrou");
  });

  it("alerts on the alunos' overdue charges only above the threshold", () => {
    const over = stats("emdia", NOW - DAY, { billing: { month: "2026-10", activePlans: 1, planCents: 1, expectedCents: 1, receivedCents: 0, overdueCents: 10_001 } });
    const exactly = stats("emdia", NOW - DAY, { billing: { month: "2026-10", activePlans: 1, planCents: 1, expectedCents: 1, receivedCents: 0, overdueCents: 10_000 } });
    const kinds = (s: TrainerStats) => adminAttention({ ...baseInput, stats: [s] }, NOW, SP).filter((i) => i.id === "personal:emdia").map((i) => i.kind);
    expect(kinds(over)).toEqual(["cobranca"]);
    expect(kinds(exactly)).toEqual([]);
  });

  it("still works without the subscriptions (no billing reasons)", () => {
    const items = adminAttention({ ...baseInput, subscriptions: null }, NOW, SP);
    expect(items).toEqual([]);
  });
});

describe("small helpers", () => {
  it("counts stale or missing summaries only for personais with access", () => {
    const input = { trainers: baseInput.trainers, stats: [stats("emdia", NOW), { ...stats("atrasado", NOW), updatedAt: NOW - 15 * DAY }] };
    expect(staleSummaryCount(input, NOW)).toBe(3); // atrasado (old), teste and semplano (missing); suspenso ignored
  });

  it("adds the alunos' charges of this month only", () => {
    const old = stats("a", NOW, { billing: { month: "2026-09", activePlans: 1, planCents: 1, expectedCents: 5, receivedCents: 5, overdueCents: 5 } });
    const now1 = stats("b", NOW, { billing: { month: "2026-10", activePlans: 1, planCents: 1, expectedCents: 7, receivedCents: 3, overdueCents: 2 } });
    expect(studentChargeTotals([old, now1], "2026-10")).toEqual({ expectedCents: 7, receivedCents: 3, overdueCents: 2 });
    expect(studentChargeTotals([old], "2026-10")).toBeNull();
  });

  it("names the personal in an audit row instead of showing the id", () => {
    const entries: AuditEntry[] = [
      { id: "1", at: 1, adminUid: "adm", actorUid: "adm", actorRole: "ADM", action: "payment.record", targetUid: "emdia", note: "ok" },
      { id: "2", at: 2, adminUid: "adm", actorUid: "adm", actorRole: "ADM", action: "trainer.create", targetUid: "abcdef123456", note: "" },
    ];
    const rows = auditRows(entries, baseInput.trainers);
    expect(rows[0]).toMatchObject({ title: "Pagamento da mensalidade registrado", subject: "EMDIA" });
    expect(rows[1].subject).toBe("Conta abcdef…");
  });
});
