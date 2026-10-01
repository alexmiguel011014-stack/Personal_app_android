export const ACTIVITY_KINDS = [
  "login",
  "studentCreated",
  "inviteGenerated",
  "fichaSaved",
  "geminiGenerated",
  "chargePaid",
  "bookingAdded",
  "measurementAdded",
  "assessmentRequested",
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ActivityActions = Record<ActivityKind, number>;

export function emptyActions(): ActivityActions {
  return Object.fromEntries(ACTIVITY_KINDS.map((kind) => [kind, 0])) as ActivityActions;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function activityDocId(trainerId: string, month: string): string {
  return `${trainerId}_${month}`;
}

export function shouldWriteLastSeen(lastWrittenMs: number | null | undefined, nowMs: number): boolean {
  return lastWrittenMs === null || lastWrittenMs === undefined || nowMs - lastWrittenMs >= 10 * 60 * 1000;
}
