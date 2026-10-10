import { describe, expect, it } from "vitest";
import {
  DUE_SOON_DAYS,
  endOfDayDeadline,
  mensalidadeLabel,
  mensalidadeOf,
  mensalidadeRank,
  nextPaidThrough,
  type MensalidadeInput,
} from "./mensalidades";

const at = (iso: string): number => Date.parse(iso);
const NOW = at("2026-10-09T15:00:00-03:00");
const current = (until: number | null): MensalidadeInput => ({ hasSubscription: true, billingStatus: "current", billingUntil: until });

describe("endOfDayDeadline", () => {
  it("is the last millisecond of the São Paulo day", () => {
    expect(endOfDayDeadline("2026-10-09")).toBe(at("2026-10-09T23:59:59.999-03:00"));
    expect(endOfDayDeadline("2026-10-09") + 1).toBe(at("2026-10-10T00:00:00-03:00"));
  });
});

describe("nextPaidThrough", () => {
  it("counts a payment made during a trial from the trial end", () => {
    const trialEnd = at("2026-10-16T14:00:00-03:00");
    expect(nextPaidThrough(NOW, trialEnd).date).toBe("2026-11-16");
  });

  it("extends a current account from its expiry day, not from today", () => {
    expect(nextPaidThrough(NOW, endOfDayDeadline("2026-10-20")).date).toBe("2026-11-20");
  });

  it("restarts from today when the access already expired or never had one", () => {
    expect(nextPaidThrough(NOW, endOfDayDeadline("2026-10-01")).date).toBe("2026-11-09");
    expect(nextPaidThrough(NOW, null).date).toBe("2026-11-09");
  });

  it("clamps a month-end date and ends the day at 23:59:59.999", () => {
    const result = nextPaidThrough(at("2026-01-31T10:00:00-03:00"), null);
    expect(result.date).toBe("2026-02-28");
    expect(result.until).toBe(at("2026-02-28T23:59:59.999-03:00"));
  });

  it("treats an expiry that is exactly now as expired", () => {
    expect(nextPaidThrough(NOW, NOW).date).toBe("2026-11-09");
  });
});

describe("mensalidadeOf", () => {
  it("has no plan without a subscription: locked for a new account, open for a legacy one", () => {
    const fresh = mensalidadeOf({ hasSubscription: false, billingStatus: "pending", billingUntil: null }, NOW);
    expect(fresh).toMatchObject({ state: "sem_plano", accessOpen: false });
    expect(mensalidadeLabel(fresh)).toBe("Sem plano");
    const legacy = mensalidadeOf({ hasSubscription: false, billingStatus: null, billingUntil: null }, NOW);
    expect(legacy).toMatchObject({ state: "sem_plano", accessOpen: true });
    expect(mensalidadeLabel(legacy)).toBe("Sem plano · acesso liberado (conta anterior)");
  });

  it("waits for the first payment while pending", () => {
    const result = mensalidadeOf({ hasSubscription: true, billingStatus: "pending", billingUntil: null }, NOW);
    expect(result).toMatchObject({ state: "aguardando", accessOpen: false });
    expect(mensalidadeLabel(result)).toBe("Aguardando pagamento");
  });

  it("counts a running trial in calendar days", () => {
    const input: MensalidadeInput = { hasSubscription: true, billingStatus: "trial", billingUntil: at("2026-10-14T14:00:00-03:00") };
    const result = mensalidadeOf(input, NOW);
    expect(result).toMatchObject({ state: "teste", daysLeft: 5, accessOpen: true });
    expect(mensalidadeLabel(result)).toBe("Em teste · 5 dias restantes");
    expect(mensalidadeLabel(mensalidadeOf({ ...input, billingUntil: at("2026-10-10T14:00:00-03:00") }, NOW))).toBe("Em teste · 1 dia restante");
    expect(mensalidadeLabel(mensalidadeOf({ ...input, billingUntil: at("2026-10-09T18:00:00-03:00") }, NOW))).toBe("Em teste · termina hoje");
  });

  it("is late once a trial deadline has passed", () => {
    const result = mensalidadeOf({ hasSubscription: true, billingStatus: "trial", billingUntil: NOW - 1 }, NOW);
    expect(result).toMatchObject({ state: "atrasado", accessOpen: false, daysLate: 0 });
    expect(mensalidadeLabel(result)).toBe("Venceu hoje");
  });

  it("is up to date beyond the due-soon window and due soon inside it", () => {
    expect(DUE_SOON_DAYS).toBe(5);
    const far = mensalidadeOf(current(endOfDayDeadline("2026-10-15")), NOW);
    expect(far).toMatchObject({ state: "em_dia", daysLeft: 6 });
    expect(mensalidadeLabel(far)).toBe("Em dia · vence em 6 dias");
    const near = mensalidadeOf(current(endOfDayDeadline("2026-10-14")), NOW);
    expect(near).toMatchObject({ state: "vence_breve", daysLeft: 5 });
    expect(mensalidadeLabel(near)).toBe("Vence em 5 dias");
  });

  it("keeps the last valid day open and reports it as due today", () => {
    const result = mensalidadeOf(current(endOfDayDeadline("2026-10-09")), NOW);
    expect(result).toMatchObject({ state: "vence_breve", daysLeft: 0, accessOpen: true });
    expect(mensalidadeLabel(result)).toBe("Vence hoje");
  });

  it("is late from the first millisecond after the expiry day", () => {
    const deadline = endOfDayDeadline("2026-10-08");
    expect(mensalidadeOf(current(deadline), deadline - 1).state).toBe("vence_breve");
    const late = mensalidadeOf(current(deadline), deadline + 1);
    expect(late).toMatchObject({ state: "atrasado", daysLate: 1, accessOpen: false });
    expect(mensalidadeLabel(late)).toBe("Em atraso há 1 dia");
    expect(mensalidadeLabel(mensalidadeOf(current(endOfDayDeadline("2026-10-06")), NOW))).toBe("Em atraso há 3 dias");
  });

  it("treats the exact deadline instant as expired, like the rules", () => {
    expect(mensalidadeOf(current(NOW), NOW)).toMatchObject({ state: "atrasado", accessOpen: false });
  });

  it("shows a blocked account as late even without an expiry", () => {
    const result = mensalidadeOf({ hasSubscription: true, billingStatus: "blocked", billingUntil: null }, NOW);
    expect(result).toMatchObject({ state: "atrasado", daysLate: null, accessOpen: false });
    expect(mensalidadeLabel(result)).toBe("Bloqueado");
  });

  it("marks a current account without an expiry instead of guessing one", () => {
    const result = mensalidadeOf(current(null), NOW);
    expect(result).toMatchObject({ state: "em_dia", noExpiry: true, accessOpen: true });
    expect(mensalidadeLabel(result)).toBe("Em dia · sem vencimento definido");
  });
});

describe("mensalidadeRank", () => {
  it("puts late accounts first and accounts without a plan last", () => {
    const order = (["sem_plano", "em_dia", "teste", "vence_breve", "aguardando", "atrasado"] as const)
      .slice().sort((a, b) => mensalidadeRank(a) - mensalidadeRank(b));
    expect(order).toEqual(["atrasado", "aguardando", "vence_breve", "teste", "em_dia", "sem_plano"]);
  });
});
