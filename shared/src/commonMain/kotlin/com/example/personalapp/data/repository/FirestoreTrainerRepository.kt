package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.util.CrashReporter
import com.example.personalapp.util.currentTimeMillis
import dev.gitlive.firebase.auth.FirebaseAuth
import dev.gitlive.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * GOALS.md §19c: the web implementation of [TrainerRepository] — no SQLDelight offline cache
 * (19a's scope cut), every read is a live Firestore query/listener and every write goes to
 * Firestore only. [startListening]/[stopListening] are no-ops here: there is no local mirror to
 * start or stop, every `getX()` below already listens to Firestore directly.
 *
 * Same silent-catch-and-report behavior on writes as [SqlDelightTrainerRepository] (matches
 * existing cross-platform behavior, and avoids reintroducing the GOALS.md §17c crash class this
 * project already fixed once) — the trade-off is that a failed write here has no optimistic
 * local copy to fall back on, so the UI simply doesn't update rather than showing stale data.
 */
class FirestoreTrainerRepository(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
) : TrainerRepository {
    private fun currentTrainerId(): String? = auth.currentUser?.uid

    private suspend fun safeFirestoreWrite(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            CrashReporter.recordException(e)
        }
    }

    override fun startListening(trainerId: String) { /* no-op: every read below is already live */ }
    override fun stopListening() { /* no-op: nothing was started */ }

    // Users / Students
    override suspend fun insertUser(user: UserEntity) {
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("students").document(user.id).set(user.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun updateUser(user: UserEntity) {
        safeFirestoreWrite {
            if (user.linked) {
                firestore.collection("users").document(user.id)
                    .set(user.toLinkedStudentUpdateMap(), merge = true)
            } else {
                currentTrainerId()?.let {
                    firestore.collection("students").document(user.id).set(user.toFirestoreMap(it))
                }
            }
        }
    }

    override suspend fun deleteUser(user: UserEntity) {
        val collection = if (user.linked) "users" else "students"
        safeFirestoreWrite {
            firestore.collection(collection).document(user.id).delete()
        }
    }

    // Combines drafts (students/{id}, unlinked) and linked accounts (users/{uid}, role STUDENT)
    // into one list — the same two sources SqlDelightTrainerRepository.startListening mirrors
    // separately, merged here directly instead of through a local table.
    override fun getStudents(): Flow<List<UserEntity>> {
        val trainerId = currentTrainerId() ?: return flowOf(emptyList())
        val drafts = firestore.collection("students").where { "trainerId" equalTo trainerId }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toUserEntity() } }
        val linked = firestore.collection("users")
            .where { ("trainerId" equalTo trainerId) and ("role" equalTo "STUDENT") }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toLinkedUserEntity() } }
        return combine(drafts, linked) { d, l -> d + l }
    }

    override suspend fun getUserById(id: String): UserEntity? =
        firestore.collection("students").document(id).get().toUserEntity()
            ?: firestore.collection("users").document(id).get().toLinkedUserEntity()

    override suspend fun setStudentPermission(studentId: String, canSelfAssess: Boolean, canLogBiometrics: Boolean) {
        safeFirestoreWrite {
            firestore.collection("users").document(studentId)
                .set(mapOf("canSelfAssess" to canSelfAssess, "canLogBiometrics" to canLogBiometrics), merge = true)
        }
    }

    override suspend fun requestAssessment(studentId: String) {
        safeFirestoreWrite {
            firestore.collection("users").document(studentId).updateFields { "pendingAssessmentRequest" to true }
        }
    }

    // GOALS.md §19c fix (found live, 2026-09-13): firestore.rules' `allow read` for this
    // collection checks `resource.data.trainerId` — a list query that doesn't also filter by
    // trainerId can't be proven safe by Firestore's rules engine and comes back
    // PERMISSION_DENIED, confirmed via a real failed read (StudentDetailsScreen), not guessed.
    // Every query below now mirrors SqlDelightTrainerRepository.startListening's already-working
    // `where trainerId equalTo ...` shape, narrowed further by studentId/workoutId client-side.
    override fun getAssessmentsForStudent(studentId: String): Flow<List<AssessmentEntity>> {
        val trainerId = currentTrainerId() ?: return flowOf(emptyList())
        return firestore.collection("assessments")
            .where { ("trainerId" equalTo trainerId) and ("studentId" equalTo studentId) }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toAssessmentEntity() } }
    }

    @OptIn(ExperimentalUuidApi::class)
    override suspend fun generateInvite(draft: UserEntity): String {
        val trainerId = currentTrainerId() ?: error("Not authenticated")
        val code = Uuid.random().toString().replace("-", "").take(8).uppercase()
        firestore.collection("invites").document(code).set(
            mapOf(
                "trainerId" to trainerId,
                "used" to false,
                "createdAt" to currentTimeMillis(),
                "draftId" to draft.id,
                "name" to draft.name,
                "phone" to draft.phone,
                "gender" to draft.gender,
                "goal" to draft.goal,
                "experienceLevel" to draft.experienceLevel,
                "medicalNotes" to draft.medicalNotes,
                "trainingDays" to draft.trainingDays,
            )
        )
        return code
    }

    // Biometrics
    override suspend fun insertBiometric(biometric: BiometricEntity) {
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("biometrics").document(biometric.id).set(biometric.toFirestoreMap(trainerId))
            }
        }
    }

    override fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>> {
        val trainerId = currentTrainerId() ?: return flowOf(emptyList())
        return firestore.collection("biometrics")
            .where { ("trainerId" equalTo trainerId) and ("studentId" equalTo userId) }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toBiometricEntity() } }
    }

    // Workouts — same isActive-driven status/assignedAt derivation as SqlDelightTrainerRepository.
    private fun WorkoutEntity.withDerivedStatus(): WorkoutEntity = if (isActive) {
        copy(status = "assigned", assignedAt = assignedAt ?: currentTimeMillis())
    } else {
        copy(status = "draft", assignedAt = null)
    }

    override suspend fun insertWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun updateWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun deleteWorkout(workout: WorkoutEntity) {
        safeFirestoreWrite {
            firestore.collection("workouts").document(workout.id).delete()
        }
    }

    override fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>> {
        val trainerId = currentTrainerId() ?: return flowOf(emptyList())
        return firestore.collection("workouts")
            .where { ("trainerId" equalTo trainerId) and ("studentId" equalTo studentId) and ("isActive" equalTo true) }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toWorkoutEntity() } }
    }

    override suspend fun getWorkoutById(id: String): WorkoutEntity? =
        firestore.collection("workouts").document(id).get().toWorkoutEntity()

    // History — local-only, superseded by workoutLogs (GOALS.md §4a Product goal #3) and never
    // synced to Firestore even on Android/iOS (see CLAUDE.md) — there is genuinely nowhere for
    // this to go on web. Unused today (no caller), kept as a no-op only to satisfy the interface.
    override suspend fun insertHistory(history: HistoryEntity) { /* no-op: see doc above */ }

    // Schedules — filtered by trainerId explicitly (the SQLDelight version's local table only
    // ever holds one trainer's mirrored rows by construction; Firestore has no such implicit
    // scoping, so it's applied here).
    override suspend fun insertSchedule(schedule: ScheduleEntity) {
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("schedules").document(schedule.id).set(schedule.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun deleteSchedule(schedule: ScheduleEntity) {
        safeFirestoreWrite {
            firestore.collection("schedules").document(schedule.id).delete()
        }
    }

    override suspend fun getAllSchedules(): List<ScheduleEntity> {
        val trainerId = currentTrainerId() ?: return emptyList()
        return firestore.collection("schedules").where { "trainerId" equalTo trainerId }
            .get().documents.mapNotNull { it.toScheduleEntity() }
    }

    // Workout logs — trainerId comes from the caller's own profile, not auth.currentUser, since
    // the writer is the student, not the trainer (same as SqlDelightTrainerRepository).
    override suspend fun insertWorkoutLog(log: WorkoutLogEntity, trainerId: String) {
        safeFirestoreWrite {
            firestore.collection("workoutLogs").document(log.id).set(log.toFirestoreMap(trainerId))
        }
    }

    override fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>> {
        val trainerId = currentTrainerId() ?: return flowOf(emptyList())
        return firestore.collection("workoutLogs")
            .where { ("trainerId" equalTo trainerId) and ("studentId" equalTo studentId) }
            .snapshots.map { snapshot -> snapshot.documents.mapNotNull { it.toWorkoutLogEntity() } }
    }

    override suspend fun getWorkoutLogsByWorkout(workoutId: String): List<WorkoutLogEntity> {
        val trainerId = currentTrainerId() ?: return emptyList()
        return firestore.collection("workoutLogs")
            .where { ("trainerId" equalTo trainerId) and ("workoutId" equalTo workoutId) }
            .get().documents.mapNotNull { it.toWorkoutLogEntity() }
    }
}
