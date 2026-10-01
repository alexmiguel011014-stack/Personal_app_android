import {
  collection,
  doc,
  getDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  writeBatch,
  where,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import { toAuditEntry, toTrainerActivity, toTrainerStats, toTrainerUser, type AuditAction, type AuditEntry, type TrainerActivity, type TrainerStats, type TrainerUser } from "./converters";

export interface TrainerRequest {
  id: string;
  email: string;
  createdAt: number;
}

function mapped<T>(snapshot: { docs: Array<{ id: string; data(): Record<string, unknown> }> }, convert: (id: string, data: Record<string, unknown>) => T | null): T[] {
  return snapshot.docs.map((document) => convert(document.id, document.data())).filter((item) => item !== null);
}

export async function loadTrainers(db: Firestore): Promise<TrainerUser[]> {
  const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "TRAINER")));
  return mapped(snapshot, toTrainerUser);
}

export async function loadTrainerStats(db: Firestore): Promise<TrainerStats[]> {
  return mapped(await getDocs(collection(db, "trainerStats")), toTrainerStats);
}

export async function countAdmins(db: Firestore): Promise<number> {
  return (await getCountFromServer(query(collection(db, "users"), where("role", "==", "ADM")))).data().count;
}

export async function loadActivity(db: Firestore, trainerId: string, months: readonly string[]): Promise<TrainerActivity[]> {
  if (months.length === 0) return [];
  const requestedMonths = [...new Set(months)];
  const snapshots = await Promise.all(requestedMonths.map((month) => getDoc(doc(db, "trainerActivity", `${trainerId}_${month}`))));
  const activities: TrainerActivity[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.exists()) continue;
    const activity = toTrainerActivity(snapshot.id, snapshot.data());
    if (activity !== null) activities.push(activity);
  }
  return activities;
}

export async function countLinkedStudents(db: Firestore, trainerId: string): Promise<number> {
  const result = await getCountFromServer(query(
    collection(db, "users"), where("role", "==", "STUDENT"), where("trainerId", "==", trainerId),
  ));
  return result.data().count;
}

export async function loadTrainerRequests(db: Firestore): Promise<TrainerRequest[]> {
  const snapshot = await getDocs(collection(db, "trainerRequests"));
  return snapshot.docs.flatMap((document) => {
    const data = document.data();
    return typeof data.email === "string"
      ? [{ id: document.id, email: data.email, createdAt: Number.isInteger(data.createdAt) ? data.createdAt as number : 0 }]
      : [];
  });
}

export async function loadLatestAudit(db: Firestore): Promise<AuditEntry[]> {
  const snapshot = await getDocs(query(collection(db, "adminAudit"), orderBy("at", "desc"), limit(50)));
  return mapped(snapshot, toAuditEntry);
}

export async function loadTrainerAudit(db: Firestore, trainerUid: string): Promise<AuditEntry[]> {
  const snapshot = await getDocs(query(collection(db, "adminAudit"), where("targetUid", "==", trainerUid)));
  return mapped(snapshot, toAuditEntry).sort((a, b) => b.at - a.at).slice(0, 50);
}

function audit(db: Firestore, batch: WriteBatch, adminUid: string, action: AuditAction, targetUid: string, note: string, at: number): void {
  const ref = doc(collection(db, "adminAudit"));
  batch.set(ref, { at, adminUid, action, targetUid, note: note.slice(0, 200) });
}

export async function recordAudit(db: Firestore, entry: Omit<AuditEntry, "id">): Promise<void> {
  const batch = writeBatch(db);
  audit(db, batch, entry.adminUid, entry.action, entry.targetUid, entry.note, entry.at);
  await batch.commit();
}

export async function setAccessStatus(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  status: "active" | "suspended",
  reason: string,
): Promise<void> {
  if (adminUid === trainerUid) throw new Error("Não é possível alterar o acesso da própria conta.");
  const target = await getDoc(doc(db, "users", trainerUid));
  if (!target.exists() || target.data().role !== "TRAINER") throw new Error("Somente contas de personal podem ter o acesso alterado.");
  const batch = writeBatch(db);
  const suspended = status === "suspended";
  batch.update(doc(db, "users", trainerUid), {
    accessStatus: status,
    suspendedAt: suspended ? Date.now() : null,
    suspendedReason: suspended ? reason.slice(0, 200) : null,
  });
  audit(db, batch, adminUid, suspended ? "trainer.suspend" : "trainer.reactivate", trainerUid, reason, Date.now());
  await batch.commit();
}

export async function promoteToTrainer(db: Firestore, adminUid: string, uid: string, name: string): Promise<void> {
  if (adminUid === uid) throw new Error("Não é possível promover a própria conta.");
  const target = await getDoc(doc(db, "users", uid));
  if (!target.exists() || target.data().role === "ADM") throw new Error("Esta conta não pode ser promovida por este fluxo.");
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), { role: "TRAINER", name, createdBy: adminUid }, { merge: true });
  audit(db, batch, adminUid, "trainer.promote", uid, "Promovido para personal", Date.now());
  await batch.commit();
}

export async function rejectRequest(db: Firestore, adminUid: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "trainerRequests", uid));
  audit(db, batch, adminUid, "request.reject", uid, "Solicitação recusada", Date.now());
  await batch.commit();
}

export async function approveRequest(db: Firestore, adminUid: string, uid: string, email: string, name: string): Promise<void> {
  if (adminUid === uid) throw new Error("Não é possível promover a própria conta.");
  const target = await getDoc(doc(db, "users", uid));
  if (target.exists() && target.data().role === "ADM") throw new Error("Uma conta ADM não pode ser promovida por este fluxo.");
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), {
    role: "TRAINER",
    name: name.trim(),
    email,
    createdAt: Date.now(),
    createdBy: adminUid,
    accessStatus: "active",
  }, { merge: true });
  batch.delete(doc(db, "trainerRequests", uid));
  audit(db, batch, adminUid, "trainer.promote", uid, "Solicitação aprovada", Date.now());
  await batch.commit();
}
