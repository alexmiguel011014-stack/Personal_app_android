package com.example.personalapp.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.tasks.await

enum class UserRole {
    ADM, TRAINER, STUDENT, NONE
}

// trainerId is only ever set for a STUDENT who has claimed an invite (see GOALS.md §7) — null
// for every other role, and null for a STUDENT who hasn't linked to a trainer yet.
data class AuthResult(val role: UserRole, val trainerId: String?)

class AuthRepository(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) {
    suspend fun login(email: String, pass: String): Result<AuthResult> {
        return try {
            val result = auth.signInWithEmailAndPassword(email, pass).await()
            val uid = result.user?.uid ?: return Result.failure(Exception("UID não encontrado"))

            // Buscar role no Firestore
            val doc = firestore.collection("users").document(uid).get().await()
            val roleStr = doc.getString("role")?.uppercase() ?: "STUDENT"

            val role = try {
                UserRole.valueOf(roleStr)
            } catch (e: Exception) {
                UserRole.STUDENT
            }

            Result.success(AuthResult(role, doc.getString("trainerId")))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Self-registration only ever produces an account with no Firestore role doc — `role`/
    // `trainerId` are server-assigned (see firestore.rules), self-registered accounts can't
    // grant themselves TRAINER/ADM. `login()`'s own missing-role fallback already resolves this
    // to STUDENT, so this reuses the same path rather than duplicating the role lookup.
    suspend fun register(email: String, pass: String): Result<AuthResult> {
        return try {
            auth.createUserWithEmailAndPassword(email, pass).await()
            login(email, pass)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Queues a request an ADM can see and approve from the Gestão tab (GOALS.md §5e) — approval
    // itself is a separate, ADM-only write to users/{uid}.role, so this never grants TRAINER by
    // itself; it's just a visible "someone is asking" mailbox, doc ID = the requester's own uid.
    suspend fun requestTrainerAccess(): Result<Unit> {
        val user = auth.currentUser ?: return Result.failure(Exception("Não autenticado"))
        return try {
            firestore.collection("trainerRequests").document(user.uid).set(
                mapOf(
                    "email" to (user.email ?: ""),
                    "createdAt" to System.currentTimeMillis(),
                )
            ).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun resetPassword(email: String): Result<Unit> {
        return try {
            auth.sendPasswordResetEmail(email).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // Claims an invite code for the currently signed-in user, writing their users/{uid} doc
    // (role=STUDENT + trainerId + the profile fields the trainer pre-filled on the invite) and
    // marking the invite used, atomically — a transaction closes the race where two devices
    // claim the same code before either write lands (see GOALS.md §7).
    suspend fun claimInvite(code: String): Result<String> {
        val uid = auth.currentUser?.uid ?: return Result.failure(Exception("Não autenticado"))
        return try {
            val trainerId = firestore.runTransaction { transaction ->
                val inviteRef = firestore.collection("invites").document(code)
                val invite = transaction.get(inviteRef)
                if (!invite.exists()) throw Exception("Código de convite inválido")
                if (invite.getBoolean("used") == true) throw Exception("Código de convite já utilizado")
                val trainerId = invite.getString("trainerId") ?: throw Exception("Convite inválido")

                val userRef = firestore.collection("users").document(uid)
                transaction.set(
                    userRef,
                    mapOf(
                        "role" to "STUDENT",
                        "trainerId" to trainerId,
                        "inviteCode" to code,
                        "name" to (invite.getString("name") ?: ""),
                        "phone" to (invite.getString("phone") ?: ""),
                        "gender" to (invite.getString("gender") ?: "Masculino"),
                        "goal" to (invite.getString("goal") ?: ""),
                        "experienceLevel" to (invite.getString("experienceLevel") ?: ""),
                        "medicalNotes" to (invite.getString("medicalNotes") ?: ""),
                        "trainingDays" to (invite.get("trainingDays") ?: emptyList<String>()),
                        "createdAt" to System.currentTimeMillis(),
                    )
                )
                transaction.update(inviteRef, "used", true)
                trainerId
            }.await()
            Result.success(trainerId)
        } catch (e: Exception) {
            // A PERMISSION_DENIED here (not an invalid-code/already-used message from the checks
            // above) means this account's users/{uid} doc already has an incompatible role or
            // trainerId — firestore.rules deliberately blocks overwriting that (GOALS.md §13d).
            // The raw Firebase message is opaque, so surface something actionable instead.
            val firestoreCause = e as? FirebaseFirestoreException
                ?: (e.cause as? FirebaseFirestoreException)
            if (firestoreCause?.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) {
                Result.failure(Exception("Esta conta já está vinculada a um perfil existente — fale com o administrador."))
            } else {
                Result.failure(e)
            }
        }
    }

    fun getCurrentUser() = auth.currentUser

    fun logout() {
        auth.signOut()
    }
}
