import { FirebaseError } from "firebase/app";
import { doc, runTransaction, type Firestore } from "firebase/firestore";

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
  try {
    const trainerId = await runTransaction(db, async (transaction) => {
      const invite = await transaction.get(inviteRef);
      if (!invite.exists()) throw new ClaimRejected("Código de convite inválido");
      if (invite.get("used") === true) throw new ClaimRejected("Código de convite já utilizado");
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
      return inviteTrainerId;
    });
    return { ok: true, trainerId };
  } catch (error) {
    if (error instanceof ClaimRejected) return { ok: false, message: error.message };
    // Not a bad code: this account already has a role or a trainer, and the rules refuse to
    // overwrite either (GOALS.md §13d). The raw Firebase message says nothing useful.
    if (error instanceof FirebaseError && error.code === "permission-denied") {
      return { ok: false, message: "Esta conta já está vinculada a um perfil existente — fale com o administrador." };
    }
    return { ok: false, message: "Não foi possível aceitar o convite. Tente de novo." };
  }
}
