import { collection, doc, runTransaction, type Firestore } from "firebase/firestore";
import { isDeadlineExpired } from "../domain/platformBilling";
import type { StudentProfile } from "../domain/studentProfile";

export async function createAdminRecoveryDraft(
  db: Firestore,
  adminUid: string,
  trainerUid: string,
  profile: StudentProfile,
  reasonInput: string,
  now = Date.now(),
): Promise<string> {
  const reason = reasonInput.trim();
  if (!adminUid || !trainerUid) throw new Error("Não foi possível identificar o ADM ou o personal.");
  if (!reason || reason.length > 200) throw new Error("Informe um motivo com até 200 caracteres.");
  if (!profile.name.trim() || profile.name.trim().length > 120) throw new Error("Informe o nome do aluno.");

  const studentRef = doc(collection(db, "students"));
  const auditRef = doc(db, "adminAudit", studentRef.id);
  const trainerRef = doc(db, "users", trainerUid);
  const subscriptionRef = doc(db, "platformSubscriptions", trainerUid);
  await runTransaction(db, async (transaction) => {
    const [trainer, subscription] = await Promise.all([
      transaction.get(trainerRef),
      transaction.get(subscriptionRef),
    ]);
    if (!trainer.exists() || trainer.get("role") !== "TRAINER") throw new Error("A conta selecionada não pertence a um personal válido.");
    if (!subscription.exists()) throw new Error("Atribua um plano ou teste ao personal antes de cadastrar um aluno.");
    const billingStatus = trainer.get("platformBillingStatus");
    const billingUntil = trainer.get("platformBillingUntil");
    if (trainer.get("accessStatus") === "suspended" || (billingStatus !== "trial" && billingStatus !== "current") ||
      isDeadlineExpired(billingUntil, now)) {
      throw new Error("A conta do personal está bloqueada. Regularize o acesso antes de cadastrar o aluno.");
    }
    const subscriptionMode = subscription.get("mode");
    const trialEndsAt = subscription.get("trialEndsAt");
    if (subscriptionMode === "trial" && (typeof trialEndsAt !== "number" || isDeadlineExpired(trialEndsAt, now))) {
      throw new Error("O período de teste do personal terminou. Regularize o acesso antes de cadastrar o aluno.");
    }

    transaction.set(studentRef, {
      trainerId: trainerUid,
      name: profile.name.trim(),
      role: "student",
      gender: profile.gender,
      phone: profile.phone,
      goal: profile.goal,
      experienceLevel: profile.experienceLevel,
      medicalNotes: "",
      trainingDays: profile.trainingDays,
      createdAt: now,
    });
    transaction.set(auditRef, {
      at: now,
      adminUid,
      action: "admin.student.create",
      targetUid: trainerUid,
      note: reason,
      studentId: studentRef.id,
    });
  });
  return studentRef.id;
}
