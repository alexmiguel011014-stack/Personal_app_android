import { describe, expect, it } from "vitest";
import {
  countActiveInvitesFromOtherClients,
  countActivePlatformInvites,
  countPendingPlatformSeats,
  isPlatformInviteActive,
  nextInviteExtraMonthlyChargeCents,
  type PlatformInviteRecord,
} from "./platformInvites";

const legacyInvite: PlatformInviteRecord = { id: "legacy", trainerId: "trainer-a", used: false };
const invites: PlatformInviteRecord[] = [
  legacyInvite,
  { id: "web", trainerId: "trainer-a", used: false, expiresAt: 2_000, source: "web" },
  { id: "claimed", trainerId: "trainer-a", used: true },
  { id: "expired", trainerId: "trainer-a", used: false, expiresAt: 999 },
  { id: "other", trainerId: "trainer-b", used: false },
];

describe("platform invite counts", () => {
  it("keeps a legacy invite active until the ADM resolves it", () => {
    expect(isPlatformInviteActive(legacyInvite, 1_000)).toBe(true);
  });

  it("counts only active invites for the selected trainer", () => {
    expect(countActivePlatformInvites(invites, "trainer-a", 1_000)).toBe(2);
    expect(countPendingPlatformSeats(invites, "trainer-a", 1_000)).toBe(2);
  });

  it("separates invites made by other clients from website invites", () => {
    expect(countActiveInvitesFromOtherClients(invites, "trainer-a", 1_000)).toBe(1);
  });

  it("shows the extra recurring price only when the next pending seat exceeds the included seats", () => {
    const terms = { includedStudentSeats: 5, extraStudentMonthlyCents: 700 };
    expect(nextInviteExtraMonthlyChargeCents(terms, 3, 1)).toBe(0);
    expect(nextInviteExtraMonthlyChargeCents(terms, 5, 0)).toBe(700);
  });
});
