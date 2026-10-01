import { arrayUnion, doc, getDoc, increment, setDoc, type Firestore } from "firebase/firestore";
import { DEFAULT_TIME_ZONE, localDate } from "../domain/dates";
import { activityDocId, monthOf, shouldWriteLastSeen, type ActivityKind } from "../domain/activity";
import type { DashboardFigures } from "../domain/dashboard";
import type { TrainerSnapshot } from "./trainerData";

export async function trackActivity(
  db: Firestore,
  trainerId: string,
  kind: ActivityKind,
  now: number,
  timeZone: string,
): Promise<void> {
  try {
    const day = localDate(now, timeZone);
    const month = monthOf(day);
    await setDoc(doc(db, "trainerActivity", activityDocId(trainerId, month)), {
      trainerId,
      month,
      updatedAt: now,
      actions: { [kind]: increment(1) },
      activeDays: arrayUnion(day),
    }, { merge: true });
  } catch {
    // Telemetry must never prevent a trainer action from succeeding.
  }
}

export async function writeTrainerStats(
  db: Firestore,
  trainerId: string,
  figures: DashboardFigures,
  snapshot: TrainerSnapshot,
  now: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Promise<void> {
  const activePlans = snapshot.plans.filter((plan) => plan.active);
  const statsRef = doc(db, "trainerStats", trainerId);
  const existing = await getDoc(statsRef);
  const lastSeenAt = existing.exists() ? existing.get("lastSeenAt") : null;
  const previous = typeof lastSeenAt === "number" ? lastSeenAt : null;
  const updateLastSeen = shouldWriteLastSeen(previous, now);
  if (!updateLastSeen) return;
  const summary = {
    trainerId,
    updatedAt: now,
    lastSeenAt: now,
    students: figures.students,
    sessions7d: figures.sessions,
    adherence28d: figures.adherence,
    quiet: figures.quiet.length,
    pendingAssessments: figures.pendingAssessments.length,
    billing: {
      month: localDate(now, timeZone).slice(0, 7),
      activePlans: activePlans.length,
      planCents: activePlans.reduce((sum, plan) => sum + plan.amountCents, 0),
      expectedCents: figures.payments.expectedCents,
      receivedCents: figures.payments.receivedCents,
      overdueCents: figures.payments.overdueCents,
    },
  };
  await setDoc(statsRef, summary, { merge: true });
}
