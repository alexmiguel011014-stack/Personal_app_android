// GOALS.md §36a — billing documents in the shape that is really in production, for the tests of the shared engine,
// the Rules and the legacy migration. §35's bug came from fixtures that were cleaner than production, so these follow
// firestore.rules (`isBillingPlan`, `isPayment`) field for field: every field present, nulls explicit, ids `studentId_YYYY-MM`.
//
// "Today" for every scenario is TODAY (2026-10-20, a Tuesday), in America/Sao_Paulo.

export const TODAY = "2026-10-20";
export const TRAINER = "trainerLegacy";
/** An instant on TODAY, midday in São Paulo. */
export const NOW = Date.parse(`${TODAY}T12:00:00-03:00`);

type Doc = Record<string, unknown>;

export function legacyPlan(studentId: string, overrides: Doc = {}): Doc {
  return {
    studentId,
    trainerId: TRAINER,
    amountCents: 15_000,
    currency: "BRL",
    dueDay: 10,
    active: true,
    createdAt: Date.parse("2026-07-01T12:00:00-03:00"),
    ...overrides,
  };
}

export function legacyCharge(studentId: string, yearMonth: string, dueDay: number, overrides: Doc = {}): Doc {
  const last = new Date(Date.UTC(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5, 7)), 0)).getUTCDate();
  return {
    trainerId: TRAINER,
    studentId,
    amountCents: 15_000,
    currency: "BRL",
    dueDate: `${yearMonth}-${String(Math.min(dueDay, last)).padStart(2, "0")}`,
    paidAt: null,
    method: null,
    source: "manual",
    externalId: null,
    note: null,
    createdAt: Date.parse(`${yearMonth}-01T12:00:00-03:00`),
    ...overrides,
  };
}

/** A charge already paid on `paidOn` ("YYYY-MM-DD", midday São Paulo). */
export function paid(paidOn: string, method: "pix" | "cash" | "card" | "transfer" | "other" = "pix", note: string | null = null): Doc {
  return { paidAt: Date.parse(`${paidOn}T12:00:00-03:00`), method, note };
}

/** `billingPlans/{id}` documents. */
export const legacyPlanDocs: Record<string, Doc> = {
  // up to date until last month's, this month's due on the 10th and still unpaid → "em atraso" today
  "s-late": legacyPlan("s-late"),
  // paid this month early: nothing owed, next charge on 2026-11-05
  "s-ok": legacyPlan("s-ok", { amountCents: 20_000, dueDay: 5 }),
  // due day 31: September's charge falls on the 30th, October's on the 31st (still ahead)
  "s-31": legacyPlan("s-31", { amountCents: 18_000, dueDay: 31 }),
  // paused: no new charges, history kept
  "s-paused": legacyPlan("s-paused", { active: false }),
  // an unpaid charge from months ago, then paid ones, then unpaid again
  "s-half": legacyPlan("s-half", { amountCents: 12_000, dueDay: 15 }),
  // registered five days ago, due on the 25th: no charge document yet
  "s-new": legacyPlan("s-new", { amountCents: 25_000, dueDay: 25, createdAt: Date.parse("2026-10-15T12:00:00-03:00") }),
  // registered on a draft that later claimed an invite: the account is `acct-claimed`
  "draft-claimed": legacyPlan("draft-claimed", { amountCents: 30_000, dueDay: 20 }),
  // a draft still waiting for the invite
  "draft-open": legacyPlan("draft-open", { dueDay: 1 }),
};

/** `payments/{studentId}_{YYYY-MM}` documents. */
export const legacyChargeDocs: Record<string, Doc> = {
  "s-late_2026-08": legacyCharge("s-late", "2026-08", 10, paid("2026-08-09")),
  "s-late_2026-09": legacyCharge("s-late", "2026-09", 10, paid("2026-09-12", "cash", "pagou atrasado")),
  "s-late_2026-10": legacyCharge("s-late", "2026-10", 10),
  "s-ok_2026-09": legacyCharge("s-ok", "2026-09", 5, { amountCents: 20_000, ...paid("2026-09-05", "transfer") }),
  "s-ok_2026-10": legacyCharge("s-ok", "2026-10", 5, { amountCents: 20_000, ...paid("2026-10-04", "pix") }),
  "s-31_2026-09": legacyCharge("s-31", "2026-09", 31, { amountCents: 18_000, ...paid("2026-09-30", "card") }),
  "s-31_2026-10": legacyCharge("s-31", "2026-10", 31, { amountCents: 18_000 }),
  "s-paused_2026-08": legacyCharge("s-paused", "2026-08", 10, paid("2026-08-10")),
  "s-half_2026-07": legacyCharge("s-half", "2026-07", 15, { amountCents: 12_000 }),
  "s-half_2026-08": legacyCharge("s-half", "2026-08", 15, { amountCents: 12_000, ...paid("2026-08-16") }),
  "s-half_2026-09": legacyCharge("s-half", "2026-09", 15, { amountCents: 12_000 }),
  "s-half_2026-10": legacyCharge("s-half", "2026-10", 15, { amountCents: 12_000 }),
  "draft-claimed_2026-09": legacyCharge("draft-claimed", "2026-09", 20, { amountCents: 30_000, ...paid("2026-09-19", "pix", "antecipou") }),
  "draft-claimed_2026-10": legacyCharge("draft-claimed", "2026-10", 20, { amountCents: 30_000 }),
};

/**
 * What `billingOwners` returns for these students: the page id each billing id belongs to. `draft-claimed`'s plan
 * and charges follow the person to their account `acct-claimed`; `draft-open` is a draft nobody has claimed.
 */
export const legacyOwners: ReadonlyMap<string, { id: string; name: string }> = new Map([
  ["s-late", { id: "s-late", name: "Ana Atrasada" }],
  ["s-ok", { id: "s-ok", name: "Bruno em Dia" }],
  ["s-31", { id: "s-31", name: "Carla Dia 31" }],
  ["s-paused", { id: "s-paused", name: "Davi Pausado" }],
  ["s-half", { id: "s-half", name: "Eva Meio a Meio" }],
  ["s-new", { id: "s-new", name: "Fábio Novo" }],
  ["acct-claimed", { id: "acct-claimed", name: "Gabi Conectada" }],
  ["draft-claimed", { id: "acct-claimed", name: "Gabi Conectada" }],
  ["draft-open", { id: "draft-open", name: "Hugo Rascunho" }],
]);

/**
 * A platform subscription as the live documents have it: written before §35, so `terms` and `overrides` still carry
 * `trialMaxStudentSeats` (the field the parser no longer models) and there is no `planName`.
 */
export function platformLegacySubscription(trainerUid: string, now: number, overrides: Doc = {}): Doc {
  return {
    trainerUid,
    mode: "trial",
    terms: {
      monthlyBaseCents: 3_000,
      includedStudentSeats: 10,
      extraStudentMonthlyCents: 275,
      maxActiveInviteCodes: 15,
      trialMaxStudentSeats: 3,
      trialDurationDays: 3,
      snapshotVersion: 1,
      templateId: "plan-base",
      templateVersion: 1,
    },
    overrides: { trialMaxStudentSeats: 2 },
    chargeDuringTrial: false,
    effectiveAt: now - 3 * 86_400_000,
    trialStartedAt: now - 3 * 86_400_000,
    trialEndsAt: now - 1_000,
    currentInvoiceId: null,
    updatedAt: now - 3 * 86_400_000,
    lastAuditId: "audit-legacy",
    ...overrides,
  };
}
