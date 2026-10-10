import { describe, expect, it } from "vitest";
import { activeDaysInWindow, actionsInWindow, averageTicketCents, collectionRate, isStale, trainersCsv, usageStatus } from "./adminMetrics";
import { emptyActions } from "./activity";
import type { TrainerActivity, TrainerUser } from "../data/converters";

const zone = "America/Sao_Paulo";
const now = Date.parse("2026-10-01T12:00:00-03:00");

describe("admin metrics", () => {
  it("classifies usage at 7, 8, 30 and 31 days and handles never seen", () => {
    expect(usageStatus(null, now)).toBe("Nunca entrou");
    expect(usageStatus(now - 7 * 86_400_000, now)).toBe("Ativo");
    expect(usageStatus(now - 8 * 86_400_000, now)).toBe("Quieto");
    expect(usageStatus(now - 30 * 86_400_000, now)).toBe("Quieto");
    expect(usageStatus(now - 31 * 86_400_000, now)).toBe("Sumido");
  });

  it("sums month buckets touched by the 30-day window and unique active days in the window", () => {
    const oldMonth = { trainerId: "t", month: "2026-09", updatedAt: 0, actions: { ...emptyActions(), login: 3 }, activeDays: ["2026-09-02", "2026-09-03"] } satisfies TrainerActivity;
    const currentMonth = { trainerId: "t", month: "2026-10", updatedAt: 0, actions: { ...emptyActions(), login: 2 }, activeDays: ["2026-10-01", "2026-09-03"] } satisfies TrainerActivity;
    const ancient = { ...oldMonth, month: "2026-08", actions: { ...emptyActions(), login: 50 }, activeDays: ["2026-08-31"] };
    expect(actionsInWindow([oldMonth, currentMonth, ancient], now, zone)).toBe(5);
    expect(activeDaysInWindow([oldMonth, currentMonth, ancient], now, zone)).toBe(3);
  });

  it("handles empty billing denominators and stale summaries at the boundary", () => {
    expect(averageTicketCents(100, 0)).toBeNull();
    expect(averageTicketCents(100, 2)).toBe(50);
    expect(collectionRate(50, 0)).toBeNull();
    expect(collectionRate(50, 200)).toBe(0.25);
    expect(isStale(now - 14 * 86_400_000, now)).toBe(false);
    expect(isStale(now - 14 * 86_400_000 - 1, now)).toBe(true);
  });

  it("escapes CSV quotes and prefixes formula-leading cells", () => {
    const trainer: TrainerUser = { id: "t", role: "TRAINER", name: '=HYPERLINK("x")', email: "\tbad@example.test", createdAt: 1, createdBy: null, accessStatus: "active", suspendedAt: null, suspendedReason: null };
    const csv = trainersCsv([{ id: trainer.id, name: trainer.name, email: trainer.email, accessStatus: trainer.accessStatus, lastSeenAt: null, usage: "Nunca entrou", actions30d: 0, activeDays30d: 0, activePlans: 0, averageTicketCents: null, collectionRate: null, statsUpdatedAt: 0, stale: true, stats: null }]);
    expect(csv).toContain(String.raw`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain("'\tbad@example.test");
  });
});

describe("trainersCsv platform billing columns (GOALS.md §35)", () => {
  it("adds the platform plan and the mensalidade state, empty when not loaded", () => {
    const base = { id: "t1", name: "Ana", email: "ana@example.com", accessStatus: "active" as const, lastSeenAt: null, usage: "Nunca entrou" as const, actions30d: 0, activeDays30d: 0, activePlans: 0, averageTicketCents: null, collectionRate: null, statsUpdatedAt: 0, stale: true, stats: null };
    const lines = trainersCsv([{ ...base, billing: { planName: "Pro", state: "em_dia" } }, base]).split("\r\n");
    expect(lines[0]).toContain('"Plano da plataforma","Mensalidade da plataforma"');
    expect(lines[1]).toContain('"Pro","Em dia"');
    expect(lines[2]).toMatch(/"",""$/);
  });
});
