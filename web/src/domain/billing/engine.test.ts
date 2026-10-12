import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { endOfDayDeadline } from "./ledger";
import { mensalidadeLabel, mensalidadeOf, mensalidadeRank, mensalidadeStateName, STATES_IN_BOARD_ORDER, type MensalidadeInput } from "./standing";
import { summarize, type SummaryRow } from "./summary";
import { snapshotTerms, type BillingTemplate, type BillingTerms } from "./terms";

const at = (iso: string): number => Date.parse(iso);
const NOW = at("2026-10-20T12:00:00-03:00");
const day = (date: string): number => endOfDayDeadline(date);

describe("snapshotTerms", () => {
  type Scoped = BillingTerms & { seats: number };
  const template: BillingTemplate<Scoped> = { id: "t1", name: "Plano Base", version: 3, monthlyBaseCents: 3_000, trialDurationDays: 3, billingDay: 10, seats: 5 };
  const keys = ["monthlyBaseCents", "trialDurationDays", "billingDay", "seats"] as const;

  it("copies the template, applies overrides and records where it came from", () => {
    expect(snapshotTerms(template, { monthlyBaseCents: 2_500, seats: 9 }, 2, keys)).toEqual({
      monthlyBaseCents: 2_500, trialDurationDays: 3, billingDay: 10, seats: 9, snapshotVersion: 2, templateId: "t1", templateVersion: 3, planName: "Plano Base",
    });
  });

  it("lets an explicit null override win (a payer billed a month after payment on a plan that has a billing day)", () => {
    expect(snapshotTerms(template, { billingDay: null }, 1, keys).billingDay).toBeNull();
  });

  it("only carries the keys the scope names, and a later edit of the template cannot change it", () => {
    const editable = { ...template };
    const snapshot = snapshotTerms(editable, {}, 1, ["monthlyBaseCents", "trialDurationDays"]);
    editable.monthlyBaseCents = 9_999;
    expect(snapshot).toEqual({ monthlyBaseCents: 3_000, trialDurationDays: 3, snapshotVersion: 1, templateId: "t1", templateVersion: 3, planName: "Plano Base" });
  });
});

describe("the paused state (aluno plans)", () => {
  const input: MensalidadeInput = { hasSubscription: true, billingStatus: "current", billingUntil: day("2026-10-01"), paused: true };

  it("shows 'Pausado' even when the expiry has passed, because nothing is expected while it is paused", () => {
    const result = mensalidadeOf(input, NOW);
    expect(result.state).toBe("pausado");
    expect(mensalidadeLabel(result)).toBe("Pausado");
    expect(mensalidadeStateName("pausado")).toBe("Pausado");
    expect(mensalidadeOf({ ...input, paused: false }, NOW).state).toBe("atrasado");
  });

  it("is not a way around having no plan", () => {
    expect(mensalidadeOf({ ...input, hasSubscription: false }, NOW).state).toBe("sem_plano");
  });

  it("sorts after the paying states and before 'sem plano'; the board order names every state once", () => {
    expect(new Set(STATES_IN_BOARD_ORDER).size).toBe(7);
    expect(mensalidadeRank("pausado")).toBeGreaterThan(mensalidadeRank("em_dia"));
    expect(mensalidadeRank("pausado")).toBeLessThan(mensalidadeRank("sem_plano"));
  });

  it("reads the days in the zone it is given", () => {
    const lateNight = at("2026-10-21T01:30:00Z"); // still the 20th in São Paulo
    const input2: MensalidadeInput = { hasSubscription: true, billingStatus: "current", billingUntil: day("2026-10-20"), paused: false };
    expect(mensalidadeOf(input2, lateNight).state).toBe("vence_breve"); // last valid day in São Paulo
    expect(mensalidadeOf({ ...input2, billingUntil: endOfDayDeadline("2026-10-20", "UTC") }, lateNight, "UTC").state).toBe("atrasado");
  });
});

describe("summarize (§36 D6)", () => {
  const row = (state: MensalidadeInput, monthlyCents: number | null, paused = false): SummaryRow => ({
    standing: mensalidadeOf({ ...state, paused }, NOW),
    monthlyCents,
    paused,
  });
  const current = (until: string): MensalidadeInput => ({ hasSubscription: true, billingStatus: "current", billingUntil: day(until) });
  const rows: SummaryRow[] = [
    row(current("2026-10-30"), 100), // em dia, expires this month → expected
    row(current("2026-10-22"), 200), // vence em breve, this month → expected
    row(current("2026-10-05"), 300), // late, expired this month → expected and overdue
    row(current("2026-09-20"), 400), // late since September → overdue only
    row({ hasSubscription: true, billingStatus: "trial", billingUntil: day("2026-10-25") }, 500), // trial: not owed yet
    row({ hasSubscription: true, billingStatus: "pending", billingUntil: null }, 600), // waiting for the first payment: not owed yet
    row(current("2026-10-25"), 700, true), // paused: expects nothing
    row({ hasSubscription: false, billingStatus: null, billingUntil: null }, null), // no plan
  ];
  const payments = [
    { paidAt: at("2026-10-03T10:00:00-03:00"), amountCents: 100 },
    { paidAt: at("2026-10-15T10:00:00-03:00"), amountCents: 200 },
    { paidAt: at("2026-09-28T10:00:00-03:00"), amountCents: 999 }, // another month
    { paidAt: at("2026-10-31T23:30:00-03:00"), amountCents: 50 }, // 02:30 UTC on 1 November, still October for the trainer
  ];

  it("counts every state and the figures trainerStats stores", () => {
    const summary = summarize(rows, payments, "2026-10");
    expect(summary.counts).toEqual({ atrasado: 2, vence_breve: 1, aguardando: 1, teste: 1, em_dia: 1, pausado: 1, sem_plano: 1 });
    expect(summary.activePlans).toBe(6); // all but the paused one and the one without a plan
    expect(summary.planCents).toBe(100 + 200 + 300 + 400 + 500 + 600);
    expect(summary.receivedCents).toBe(100 + 200 + 50);
    expect(summary.expectedCents).toBe(350 + (100 + 200 + 300)); // received + what falls due this month and is still unpaid
    expect(summary.overdueCents).toBe(300 + 400); // one month's price per late subscription
  });

  it("is empty-safe", () => {
    expect(summarize([], [], "2026-10")).toEqual({
      counts: { atrasado: 0, vence_breve: 0, aguardando: 0, teste: 0, em_dia: 0, pausado: 0, sem_plano: 0 },
      activePlans: 0, planCents: 0, receivedCents: 0, expectedCents: 0, overdueCents: 0,
    });
  });

  it("reads the payment day in the trainer's zone", () => {
    expect(summarize([], payments, "2026-10", "UTC").receivedCents).toBe(100 + 200); // the 31 Oct 23:30 payment is already November in UTC
    expect(summarize([], payments, "2026-11", "UTC").receivedCents).toBe(50);
  });
});

describe("the engine has no scope in it (§36b)", () => {
  // Strings and identifiers only: comments may say where a rule comes from.
  const folder = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(folder).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

  it("does not mention seats, invite codes, administrators, trainers' uids or Firestore", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const name of files) {
      const code = readFileSync(join(folder, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, name).not.toMatch(/seats?\b|invite|adminAudit|\bADM\b|trainerUid|firebase|firestore/i);
    }
  });
});
