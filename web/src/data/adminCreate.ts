import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, sendPasswordResetEmail, signOut, type Auth } from "firebase/auth";
import { doc, runTransaction, type Firestore } from "firebase/firestore";
import { EMULATOR_PROJECT_ID, firebaseConfig } from "./firebaseConfig";
import { usingEmulators } from "./firebase";

const SECONDARY_APP_NAME = "admin-create-trainer";
const PASSWORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A one-time credential used only to create the Auth account; it is never persisted or returned to the UI. */
export function createInitialPassword(length = 20, cryptoApi: Pick<Crypto, "getRandomValues"> = globalThis.crypto): string {
  if (!Number.isInteger(length) || length < 1) throw new RangeError("Password length must be a positive integer.");
  const bytes = cryptoApi.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte & 63]).join("");
}

/** Create the trainer in an isolated Auth instance so the administrator remains signed in. */
export async function createTrainerAuthUser(email: string, password: string): Promise<string> {
  const app = initializeApp(
    usingEmulators ? { ...firebaseConfig, projectId: EMULATOR_PROJECT_ID } : firebaseConfig,
    SECONDARY_APP_NAME,
  );
  let auth: Auth | null = null;
  let uid: string | null = null;
  try {
    auth = getAuth(app);
    auth.languageCode = "pt-BR";
    if (usingEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    uid = (await createUserWithEmailAndPassword(auth, email, password)).user.uid;
  } finally {
    // Cleanup must never hide a successfully-created UID or the original Auth error.
    try {
      if (auth) await signOut(auth);
    } catch {
      // deleteApp below also tears down the secondary Auth instance.
    } finally {
      try {
        await deleteApp(app);
      } catch {
        // The account result is more important than cleanup reporting; no credentials are retained.
      }
    }
  }
  if (uid === null) throw new Error("Não foi possível criar a conta do personal.");
  return uid;
}

/** Idempotent profile + audit write, safe to retry after an uncertain Firestore response. */
export async function completeTrainerProfile(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  profile: { name: string; email: string; phone?: string },
): Promise<void> {
  const userRef = doc(db, "users", trainerUid);
  // A deterministic audit id lets a retry recognize its own committed write without duplicating it.
  const primaryAuditRef = doc(db, "adminAudit", `trainer_create_${trainerUid}`);
  const linkedAuditRef = doc(db, "adminAudit", `trainer_create_billing_${trainerUid}`);
  const at = Date.now();

  await runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const [primaryAuditSnapshot, linkedAuditSnapshot] = await Promise.all([
      transaction.get(primaryAuditRef),
      transaction.get(linkedAuditRef),
    ]);
    const previousUser = userSnapshot.data();
    if (userSnapshot.exists() && (
      previousUser?.role !== "TRAINER" || previousUser.createdBy !== adminUid || previousUser.email !== profile.email
    )) {
      throw new Error("Já existe um perfil incompatível para esta conta.");
    }
    if (primaryAuditSnapshot.exists()) {
      const previous = primaryAuditSnapshot.data();
      if (previous.adminUid !== adminUid || previous.targetUid !== trainerUid || previous.action !== "trainer.create") {
        throw new Error("Já existe um registro de auditoria incompatível para esta conta.");
      }
    }
    const primaryHasBillingLink = primaryAuditSnapshot.data()?.billingToStatus !== undefined;
    const auditRef = !primaryAuditSnapshot.exists() || primaryHasBillingLink ? primaryAuditRef : linkedAuditRef;
    const auditSnapshot = auditRef.id === primaryAuditRef.id ? primaryAuditSnapshot : linkedAuditSnapshot;
    if (auditSnapshot.exists()) {
      const previous = auditSnapshot.data();
      if (previous.adminUid !== adminUid || previous.targetUid !== trainerUid || previous.action !== "trainer.create") {
        throw new Error("Já existe um registro de auditoria incompatível para esta conta.");
      }
    }
    const billingToStatus = typeof previousUser?.platformBillingStatus === "string" ? previousUser.platformBillingStatus : "pending";
    const billingToUntil = typeof previousUser?.platformBillingUntil === "number" ? previousUser.platformBillingUntil : null;

    transaction.set(userRef, {
      role: "TRAINER",
      name: profile.name.trim(),
      email: profile.email,
      ...(profile.phone?.trim() ? { phone: profile.phone.trim() } : {}),
      createdAt: typeof previousUser?.createdAt === "number" ? previousUser.createdAt : at,
      createdBy: adminUid,
      accessStatus: "active",
      platformBillingStatus: billingToStatus,
      platformBillingUntil: billingToUntil,
      lastAuditId: auditRef.id,
    }, { merge: true });
    if (!auditSnapshot.exists()) {
      transaction.set(auditRef, {
        at,
        adminUid,
        action: "trainer.create",
        targetUid: trainerUid,
        note: "Personal cadastrado",
        billingFromStatus: previousUser?.platformBillingStatus ?? null,
        billingFromUntil: previousUser?.platformBillingUntil ?? null,
        billingToStatus,
        billingToUntil,
      });
    }
  });
}

export function sendTrainerPasswordReset(auth: ReturnType<typeof getAuth>, email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}
