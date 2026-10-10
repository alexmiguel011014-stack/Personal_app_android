import { FirebaseError } from "firebase/app";
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import {
  countActiveInvitesFromOtherClients,
  countActivePlatformInvites,
  nextInviteExtraMonthlyChargeCents,
  type PlatformInviteRecord,
} from "../domain/platformInvites";
import { canCreatePlatformInvite, isDeadlineExpired } from "../domain/platformBilling";
import type { PlatformSubscription } from "./platformSubscriptions";
import { loadPlatformSubscription } from "./platformSubscriptions";
import type { DraftStudentDoc } from "../domain/students";
import { newInviteCode } from "./students";

export interface WebsiteInviteUsage {
  subscription: PlatformSubscription;
  linkedStudentSeats: number;
  pendingInviteReservations: number;
  activeInviteCodes: number;
  activeInvitesFromOtherClients: number;
  includedSeatsRemaining: number;
  monthlyExtraChargeIfClaimedCents: number;
}

export class WebsiteInviteLimitError extends Error {}
export class WebsiteInvitePriceConfirmation extends Error {
  constructor(readonly extraMonthlyCents: number) {
    super("Confirmação de valor necessária para continuar.");
  }
}

class StaleInviteUsage extends Error {}

function asMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") {
    const result: unknown = value.toMillis();
    return typeof result === "number" && Number.isSafeInteger(result) ? result : null;
  }
  return null;
}

export function platformInviteFromDocument(id: string, data: Record<string, unknown>): PlatformInviteRecord | null {
  if (typeof data.trainerId !== "string") return null;
  return {
    id,
    trainerId: data.trainerId,
    draftId: typeof data.draftId === "string" ? data.draftId : null,
    name: typeof data.name === "string" ? data.name : null,
    used: data.used === true,
    createdAt: asMillis(data.createdAt),
    expiresAt: asMillis(data.expiresAt),
    cancelledAt: asMillis(data.cancelledAt),
    revokedAt: asMillis(data.revokedAt),
    source: typeof data.source === "string" ? data.source : null,
  };
}

function billingIsBlocked(profile: Record<string, unknown> | undefined, now: number): boolean {
  if (!profile) return true;
  if (profile.platformBillingStatus === "pending" || profile.platformBillingStatus === "blocked") return true;
  const until = asMillis(profile.platformBillingUntil);
  return isDeadlineExpired(until, now);
}

async function currentUsage(db: Firestore, trainerId: string, now: number, requireUsableAccount = true): Promise<WebsiteInviteUsage | null> {
  const [subscriptionView, profileSnapshot, inviteSnapshot, linkedCount] = await Promise.all([
    loadPlatformSubscription(db, trainerId),
    getDoc(doc(db, "users", trainerId)),
    getDocs(query(collection(db, "invites"), where("trainerId", "==", trainerId))),
    getCountFromServer(query(collection(db, "users"), where("role", "==", "STUDENT"), where("trainerId", "==", trainerId))),
  ]);
  const subscription = subscriptionView.subscription;
  if (!subscription) {
    if (requireUsableAccount) throw new WebsiteInviteLimitError("O ADM ainda precisa atribuir um plano ou teste a esta conta.");
    return null;
  }
  if (requireUsableAccount && (!profileSnapshot.exists() || billingIsBlocked(profileSnapshot.data(), now))) {
    throw new WebsiteInviteLimitError("A conta está bloqueada para novos convites. Peça ao ADM para regularizar o acesso.");
  }
  if (requireUsableAccount && subscription.mode === "trial" && isDeadlineExpired(subscription.trialEndsAt, now)) {
    throw new WebsiteInviteLimitError("O período de teste terminou. Peça ao ADM para regularizar o acesso.");
  }
  const invites = inviteSnapshot.docs
    .map((item) => platformInviteFromDocument(item.id, item.data()))
    .filter((item): item is PlatformInviteRecord => item !== null);
  const activeInviteCodes = countActivePlatformInvites(invites, trainerId, now);
  const pendingInviteReservations = activeInviteCodes;
  const linkedStudentSeats = linkedCount.data().count;
  return {
    subscription,
    linkedStudentSeats,
    pendingInviteReservations,
    activeInviteCodes,
    activeInvitesFromOtherClients: countActiveInvitesFromOtherClients(invites, trainerId, now),
    includedSeatsRemaining: Math.max(0, subscription.terms.includedStudentSeats - linkedStudentSeats),
    monthlyExtraChargeIfClaimedCents: nextInviteExtraMonthlyChargeCents(
      subscription.terms,
      linkedStudentSeats,
      pendingInviteReservations,
    ),
  };
}

export function loadWebsiteInviteUsage(db: Firestore, trainerId: string, now = Date.now()): Promise<WebsiteInviteUsage> {
  return currentUsage(db, trainerId, now).then((usage) => {
    if (!usage) throw new WebsiteInviteLimitError("O ADM ainda precisa atribuir um plano ou teste a esta conta.");
    return usage;
  });
}

export async function resolvePlatformInviteAsAdmin(
  db: Firestore,
  adminUid: string,
  trainerId: string,
  code: string,
  reasonInput: string,
  now = Date.now(),
): Promise<void> {
  const reason = reasonInput.trim();
  if (!adminUid) throw new Error("Não foi possível identificar o ADM conectado.");
  if (!reason || reason.length > 200) throw new Error("Informe o motivo da resolução, com até 200 caracteres.");
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-F0-9]{8}$/.test(normalizedCode)) throw new Error("Informe um código válido de 8 caracteres.");
  const batch = writeBatch(db);
  batch.update(doc(db, "invites", normalizedCode), { cancelledAt: now });
  batch.set(doc(db, "adminAudit", normalizedCode), {
    at: now,
    adminUid,
    action: "invite.resolve",
    targetUid: trainerId,
    note: reason,
    inviteId: normalizedCode,
  });
  await batch.commit();
}

/** Serializes cooperating website tabs through one trainer revision document, then reconciles live invites. */
export async function createWebsiteInvite(
  db: Firestore,
  trainerId: string,
  draft: DraftStudentDoc,
  now = Date.now(),
  acceptedExtraMonthlyCents = 0,
  nextCode: () => string = newInviteCode,
): Promise<{ code: string; usage: WebsiteInviteUsage }> {
  const stateRef = doc(db, "platformInviteState", trainerId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const stateBefore = await getDoc(stateRef);
    const revision = stateBefore.exists() ? stateBefore.get("revision") : 0;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
      throw new Error("O controle de convites está inválido. Peça ao ADM para revisar a configuração.");
    }
    const usage = await currentUsage(db, trainerId, now);
    if (!usage) throw new WebsiteInviteLimitError("O ADM ainda precisa atribuir um plano ou teste a esta conta.");
    const decision = canCreatePlatformInvite({
      terms: usage.subscription.terms,
      activeInviteCodes: usage.activeInviteCodes,
    });
    if (!decision.allowed) {
      throw new WebsiteInviteLimitError(`Limite de códigos ativos atingido (${usage.activeInviteCodes}/${usage.subscription.terms.maxActiveInviteCodes}). Cancele um convite ou aguarde um aluno usar o código.`);
    }
    if (usage.monthlyExtraChargeIfClaimedCents > acceptedExtraMonthlyCents) {
      throw new WebsiteInvitePriceConfirmation(usage.monthlyExtraChargeIfClaimedCents);
    }

      const code = nextCode();
      const inviteRef = doc(db, "invites", code);
      const auditRef = doc(collection(db, "adminAudit"));
    try {
      await runTransaction(db, async (transaction) => {
        const currentState = await transaction.get(stateRef);
        const currentRevision = currentState.exists() ? currentState.get("revision") : 0;
        if (currentRevision !== revision) throw new StaleInviteUsage();
        const existingInvite = await transaction.get(inviteRef);
        if (existingInvite.exists()) throw new StaleInviteUsage();
        transaction.set(inviteRef, {
          trainerId,
          used: false,
          createdAt: now,
          expiresAt: null,
          cancelledAt: null,
          revokedAt: null,
          source: "web",
          draftId: draft.id,
          name: draft.name,
          phone: draft.phone,
          gender: draft.gender,
          goal: draft.goal,
          experienceLevel: draft.experienceLevel,
          medicalNotes: draft.medicalNotes,
          trainingDays: draft.trainingDays,
        });
        transaction.set(stateRef, {
          trainerId,
          revision: revision + 1,
          lastCode: code,
          lastAction: "create",
          updatedAt: now,
        });
        transaction.set(auditRef, {
          at: now,
          actorUid: trainerId,
          actorRole: "TRAINER",
          action: "invite.create",
          targetUid: trainerId,
          note: "Convite criado pelo site",
          inviteId: code,
        });
      });
      return { code, usage };
    } catch (error) {
      if (error instanceof StaleInviteUsage) continue;
      if (error instanceof FirebaseError && error.code === "permission-denied") {
        throw new Error("O Firestore recusou o convite. Confira as regras Web de capacidade e cobrança.");
      }
      throw error;
    }
  }
  throw new Error("Os convites mudaram enquanto você tentava criar outro. Recarregue a página e tente novamente.");
}

export async function cancelWebsiteInvite(db: Firestore, trainerId: string, code: string, now = Date.now()): Promise<void> {
  const stateRef = doc(db, "platformInviteState", trainerId);
  const inviteRef = doc(db, "invites", code);
  const auditRef = doc(collection(db, "adminAudit"));
  try {
    await runTransaction(db, async (transaction) => {
      const [inviteSnapshot, stateSnapshot] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(stateRef),
      ]);
      if (!inviteSnapshot.exists() || inviteSnapshot.get("trainerId") !== trainerId) throw new Error("O convite não pertence a este personal.");
      if (inviteSnapshot.get("used") === true) throw new Error("Um convite já utilizado não pode ser cancelado.");
      if (inviteSnapshot.get("cancelledAt") != null || inviteSnapshot.get("revokedAt") != null) return;
      const revision = stateSnapshot.exists() ? stateSnapshot.get("revision") : 0;
      if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("O controle de convites está inválido.");
      transaction.update(inviteRef, { cancelledAt: now });
      transaction.set(stateRef, { trainerId, revision: revision + 1, lastCode: code, lastAction: "cancel", updatedAt: now });
      transaction.set(auditRef, {
        at: now,
        actorUid: trainerId,
        actorRole: "TRAINER",
        action: "invite.cancel",
        targetUid: trainerId,
        note: "Convite cancelado pelo personal",
        inviteId: code,
      });
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      throw new Error("O Firestore recusou o cancelamento. Confira as regras Web de convites.");
    }
    throw error;
  }
}
