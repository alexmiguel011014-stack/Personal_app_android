import type { PlatformBillingTerms } from "./platformBilling";

export interface PlatformInviteRecord {
  id: string;
  trainerId: string;
  draftId?: string | null;
  name?: string | null;
  used: boolean;
  createdAt?: number | null;
  /** Missing expiry is treated as active until an ADM explicitly resolves a legacy invite. */
  expiresAt?: number | null;
  cancelledAt?: number | null;
  revokedAt?: number | null;
  source?: string | null;
}

export function isPlatformInviteActive(invite: PlatformInviteRecord, now: number): boolean {
  if (invite.used || invite.cancelledAt != null || invite.revokedAt != null) return false;
  return invite.expiresAt == null || invite.expiresAt > now;
}

export function countActivePlatformInvites(
  invites: readonly PlatformInviteRecord[],
  trainerId: string,
  now: number,
): number {
  return invites.filter((invite) => invite.trainerId === trainerId && isPlatformInviteActive(invite, now)).length;
}

export function countPendingPlatformSeats(
  invites: readonly PlatformInviteRecord[],
  trainerId: string,
  now: number,
): number {
  return countActivePlatformInvites(invites, trainerId, now);
}

export function countActiveInvitesFromOtherClients(
  invites: readonly PlatformInviteRecord[],
  trainerId: string,
  now: number,
): number {
  return invites.filter((invite) =>
    invite.trainerId === trainerId && invite.source !== "web" && isPlatformInviteActive(invite, now),
  ).length;
}

export function nextInviteExtraMonthlyChargeCents(
  terms: Pick<PlatformBillingTerms, "includedStudentSeats" | "extraStudentMonthlyCents">,
  linkedStudentSeats: number,
  pendingInviteReservations: number,
): number {
  const resultingSeats = linkedStudentSeats + pendingInviteReservations + 1;
  return resultingSeats > terms.includedStudentSeats ? terms.extraStudentMonthlyCents : 0;
}
