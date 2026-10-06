import { FirebaseError } from "firebase/app";
import { collection, doc, runTransaction, type Firestore } from "firebase/firestore";

// GOALS.md §23f: the invite claim — a port of AuthRepository.claimInvite, same transaction, same
// document, same messages. firestore.rules accept it only as one atomic write: the account created
// and the invite marked used together, with no §17 permission switched on (§23d).

export type ClaimResult = { ok: true; trainerId: string } | { ok: false; message: string };

class ClaimRejected extends Error {}

/** Codes are 8 uppercase hex characters (generateInvite); the Android field uppercases input too. */
export function normalizeInviteCode(input: string): string {
  return input.trim().toUpperCase();
}

export async function claimInvite(db: Firestore, uid: string, code: string, now: number): Promise<ClaimResult> {
  const inviteRef = doc(db, "invites", code);
  const auditRef = doc(collection(db, "adminAudit"));
  try {
    const trainerId = await runTransaction(db, async (transaction) => {
      const invite = await transaction.get(inviteRef);
      if (!invite.exists()) throw new ClaimRejected("Código de convite inválido");
      // Preflight for a clear message; firestore.rules enforce the same state against server time.
      if (invite.get("used") !== false) {
        throw new ClaimRejected(invite.get("used") === true
          ? "Este código de convite já foi utilizado."
          : "Este convite não está mais disponível.");
      }
      if (invite.get("cancelledAt") != null) {
        throw new ClaimRejected("Este convite foi cancelado. Peça um novo convite ao treinador.");
      }
      if (invite.get("revokedAt") != null) {
        throw new ClaimRejected("Este convite foi revogado. Peça um novo convite ao treinador.");
      }
      const expiresAt: unknown = invite.get("expiresAt");
      if (expiresAt != null && (typeof expiresAt !== "number" || !Number.isInteger(expiresAt))) {
        throw new ClaimRejected("A validade deste convite é inválida. Peça um novo código ao treinador.");
      }
      if (typeof expiresAt === "number" && expiresAt <= now) {
        throw new ClaimRejected("Este convite expirou. Peça um novo código ao treinador.");
      }
      const inviteTrainerId: unknown = invite.get("trainerId");
      if (typeof inviteTrainerId !== "string") throw new ClaimRejected("Convite inválido");

      // The profile the trainer pre-filled on the invite, with FirestoreMappers' defaults.
      const text = (key: string, fallback = ""): string => {
        const value: unknown = invite.get(key);
        return typeof value === "string" ? value : fallback;
      };
      const trainingDays: unknown = invite.get("trainingDays");
      transaction.set(doc(db, "users", uid), {
        role: "STUDENT",
        trainerId: inviteTrainerId,
        inviteCode: code,
        name: text("name"),
        phone: text("phone"),
        gender: text("gender", "Masculino"),
        goal: text("goal"),
        experienceLevel: text("experienceLevel"),
        medicalNotes: text("medicalNotes"),
        trainingDays: Array.isArray(trainingDays) && trainingDays.every((d) => typeof d === "string") ? trainingDays : [],
        createdAt: now,
      });
      transaction.update(inviteRef, { used: true });
      transaction.set(auditRef, {
        at: now,
        actorUid: uid,
        actorRole: "STUDENT",
        action: "invite.claim",
        targetUid: inviteTrainerId,
        note: "Convite aceito pelo site",
        inviteId: code,
      });
      return inviteTrainerId;
    });
    return { ok: true, trainerId };
  } catch (error) {
    if (error instanceof ClaimRejected) return { ok: false, message: error.message };
    // Not a bad code: this account already has a role or a trainer, and the rules refuse to
    // overwrite either (GOALS.md §13d). The raw Firebase message says nothing useful.
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      return {
        ok: false,
        message: "O convite não está disponível. Ele pode ter sido pausado, cancelado ou usado, ou sua conta já estar vinculada. Peça ao personal para conferir ou reativar o cadastro.",
      };
    }
    return { ok: false, message: "Não foi possível aceitar o convite. Tente de novo." };
  }
}
