package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
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
import dev.gitlive.firebase.firestore.ChangeType
import dev.gitlive.firebase.firestore.DocumentSnapshot
import dev.gitlive.firebase.firestore.FirebaseFirestore
import dev.gitlive.firebase.firestore.Query
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

/**
 * Android/iOS implementation of [TrainerRepository] (GOALS.md §18d/§4a) — was simply named
 * `TrainerRepository` before that name became the interface (§19c). Behavior unchanged.
 */
class SqlDelightTrainerRepository(
    private val appDao: AppDao,
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
) : TrainerRepository {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var listenerJobs: List<Job> = emptyList()

    private fun currentTrainerId(): String? = auth.currentUser?.uid

    // A rejected Firestore write (e.g. a rules mismatch) otherwise surfaces as an uncaught
    // exception that crashes the whole app — confirmed live, GOALS.md §17c. Every write here
    // already applies to the local DB first, so the UI already has its (optimistic) update;
    // if the Firestore half fails, the next snapshot from `mirror`'s listener resyncs local back
    // to the server's real state (also confirmed live), so logging and swallowing here is safe —
    // there's no user-facing action to retry, just a doc that'll catch back up on its own.
    private suspend fun safeFirestoreWrite(block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            CrashReporter.recordException(e)
        }
    }

    override fun startListening(trainerId: String) {
        stopListening()
        listenerJobs = listOf(
            mirror("students", trainerId, DocumentSnapshot::toUserEntity, appDao::insertUser, appDao::deleteUserById),
            mirror("workouts", trainerId, DocumentSnapshot::toWorkoutEntity, appDao::insertWorkout, appDao::deleteWorkoutById),
            mirror("biometrics", trainerId, DocumentSnapshot::toBiometricEntity, appDao::insertBiometric, appDao::deleteBiometricById),
            mirror("schedules", trainerId, DocumentSnapshot::toScheduleEntity, appDao::insertSchedule, appDao::deleteScheduleById),
            mirror("workoutLogs", trainerId, DocumentSnapshot::toWorkoutLogEntity, appDao::insertWorkoutLog, appDao::deleteWorkoutLogById),
            mirror("assessments", trainerId, DocumentSnapshot::toAssessmentEntity, appDao::insertAssessment, appDao::deleteAssessmentById),
            // Linked students live in users/{uid}, not students/{id} — see GOALS.md §7 "unify".
            mirrorQuery(
                firestore.collection("users").where { ("trainerId" equalTo trainerId) and ("role" equalTo "STUDENT") },
                DocumentSnapshot::toLinkedUserEntity, appDao::insertUser, appDao::deleteUserById,
            ),
        )
    }

    override fun stopListening() {
        listenerJobs.forEach { it.cancel() }
        listenerJobs = emptyList()
    }

    private fun <T> mirror(
        collection: String,
        trainerId: String,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): Job = mirrorQuery(firestore.collection(collection).where { "trainerId" equalTo trainerId }, map, upsert, deleteById)

    private fun <T> mirrorQuery(
        query: Query,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): Job = scope.launch {
        query.snapshots
            .catch { error -> CrashReporter.recordException(error) }
            .collect { snapshot ->
                for (change in snapshot.documentChanges) {
                    when (change.type) {
                        ChangeType.ADDED, ChangeType.MODIFIED ->
                            map(change.document)?.let { upsert(it) }
                        ChangeType.REMOVED ->
                            deleteById(change.document.id)
                    }
                }
            }
    }

    // Users / Students
    override suspend fun insertUser(user: UserEntity) {
        appDao.insertUser(user)
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("students").document(user.id).set(user.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun updateUser(user: UserEntity) {
        appDao.updateUser(user)
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
        appDao.deleteUser(user)
        val collection = if (user.linked) "users" else "students"
        safeFirestoreWrite {
            firestore.collection(collection).document(user.id).delete()
        }
    }

    override fun getStudents(): Flow<List<UserEntity>> = appDao.getStudents()
    override suspend fun getUserById(id: String) = appDao.getUserById(id)

    override suspend fun setStudentPermission(studentId: String, canSelfAssess: Boolean, canLogBiometrics: Boolean) {
        appDao.setStudentPermissions(studentId, canSelfAssess, canLogBiometrics)
        safeFirestoreWrite {
            firestore.collection("users").document(studentId)
                .set(mapOf("canSelfAssess" to canSelfAssess, "canLogBiometrics" to canLogBiometrics), merge = true)
        }
    }

    override suspend fun requestAssessment(studentId: String) {
        appDao.setPendingAssessmentRequest(studentId, true)
        safeFirestoreWrite {
            firestore.collection("users").document(studentId).updateFields { "pendingAssessmentRequest" to true }
        }
    }

    override fun getAssessmentsForStudent(studentId: String): Flow<List<AssessmentEntity>> =
        appDao.getAssessmentsByStudent(studentId)

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
        appDao.insertBiometric(biometric)
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("biometrics").document(biometric.id).set(biometric.toFirestoreMap(trainerId))
            }
        }
    }

    override fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>> = appDao.getBiometricsByUser(userId)

    // Workouts
    //
    // `status`/`assignedAt` are derived from `isActive` here, not set by callers — `isActive` is
    // the one flag the UI (WorkoutBuilderScreen's Ativo/Inativo toggle) actually manipulates, and
    // StudentRepository.getMyWorkouts() queries Firestore for status == "assigned". Without this,
    // every workout stays "draft" forever and the student never sees anything.
    private fun WorkoutEntity.withDerivedStatus(): WorkoutEntity = if (isActive) {
        copy(status = "assigned", assignedAt = assignedAt ?: currentTimeMillis())
    } else {
        copy(status = "draft", assignedAt = null)
    }

    override suspend fun insertWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.insertWorkout(toSave)
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun updateWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.updateWorkout(toSave)
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun deleteWorkout(workout: WorkoutEntity) {
        appDao.deleteWorkout(workout)
        safeFirestoreWrite {
            firestore.collection("workouts").document(workout.id).delete()
        }
    }

    override fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>> = appDao.getActiveWorkoutsByStudent(studentId)

    override suspend fun getWorkoutById(id: String): WorkoutEntity? = appDao.getWorkoutById(id)

    // History — local-only, superseded by workoutLogs (see GOALS.md §4a Product goal #3)
    override suspend fun insertHistory(history: HistoryEntity) = appDao.insertHistory(history)

    // Schedules
    override suspend fun insertSchedule(schedule: ScheduleEntity) {
        appDao.insertSchedule(schedule)
        currentTrainerId()?.let { trainerId ->
            safeFirestoreWrite {
                firestore.collection("schedules").document(schedule.id).set(schedule.toFirestoreMap(trainerId))
            }
        }
    }

    override suspend fun deleteSchedule(schedule: ScheduleEntity) {
        appDao.deleteSchedule(schedule)
        safeFirestoreWrite {
            firestore.collection("schedules").document(schedule.id).delete()
        }
    }

    override suspend fun getAllSchedules() = appDao.getAllSchedules()

    // Workout logs — written by the student after a session (trainerId comes from their own
    // profile, not from auth.currentUser, since the writer here is the student, not the trainer).
    override suspend fun insertWorkoutLog(log: WorkoutLogEntity, trainerId: String) {
        appDao.insertWorkoutLog(log)
        safeFirestoreWrite {
            firestore.collection("workoutLogs").document(log.id).set(log.toFirestoreMap(trainerId))
        }
    }

    override fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>> = appDao.getWorkoutLogsByStudent(studentId)
    override suspend fun getWorkoutLogsByWorkout(workoutId: String) = appDao.getWorkoutLogsByWorkout(workoutId)
}
