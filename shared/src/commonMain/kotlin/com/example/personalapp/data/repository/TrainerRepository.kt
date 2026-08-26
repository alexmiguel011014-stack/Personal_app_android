package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.util.currentTimeMillis
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.FirebaseAuth
import dev.gitlive.firebase.crashlytics.crashlytics
import dev.gitlive.firebase.firestore.ChangeType
import dev.gitlive.firebase.firestore.DocumentSnapshot
import dev.gitlive.firebase.firestore.FirebaseFirestore
import dev.gitlive.firebase.firestore.Query
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
 * Firestore is the source of truth (see GOALS.md §4a): writes here go to Firestore first,
 * a snapshot listener (started via [startListening]) mirrors each trainer-scoped collection
 * back into Room, and every screen keeps reading from Room's Flows as before.
 */
class TrainerRepository(
    private val appDao: AppDao,
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var listenerJobs: List<Job> = emptyList()

    private fun currentTrainerId(): String? = auth.currentUser?.uid

    fun startListening(trainerId: String) {
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

    fun stopListening() {
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
            .catch { error -> Firebase.crashlytics.recordException(error) }
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
    suspend fun insertUser(user: UserEntity) {
        appDao.insertUser(user)
        currentTrainerId()?.let {
            firestore.collection("students").document(user.id).set(user.toFirestoreMap(it))
        }
    }

    suspend fun updateUser(user: UserEntity) {
        appDao.updateUser(user)
        if (user.linked) {
            firestore.collection("users").document(user.id)
                .set(user.toLinkedStudentUpdateMap(), merge = true)
        } else {
            currentTrainerId()?.let {
                firestore.collection("students").document(user.id).set(user.toFirestoreMap(it))
            }
        }
    }

    suspend fun deleteUser(user: UserEntity) {
        appDao.deleteUser(user)
        val collection = if (user.linked) "users" else "students"
        firestore.collection(collection).document(user.id).delete()
    }

    fun getStudents(): Flow<List<UserEntity>> = appDao.getStudents()
    suspend fun getUserById(id: String) = appDao.getUserById(id)

    // GOALS.md §17: trainer-granted, default-off permissions on a *linked* student. Meaningless
    // for a draft (students/{id} has no Firebase Auth account to grant anything to) — callers are
    // expected to only offer this for `linked == true` students (StudentDetailsScreen already
    // only shows the section then).
    suspend fun setStudentPermission(studentId: String, canSelfAssess: Boolean, canLogBiometrics: Boolean) {
        appDao.setStudentPermissions(studentId, canSelfAssess, canLogBiometrics)
        firestore.collection("users").document(studentId)
            .set(mapOf("canSelfAssess" to canSelfAssess, "canLogBiometrics" to canLogBiometrics), merge = true)
    }

    // Pull-based request (GOALS.md §17a): just flips a flag the student sees next time they open
    // the app — no push infrastructure. Written directly with .update(), not toFirestoreMap(),
    // since firestore.rules restricts this write to *only* this one field.
    suspend fun requestAssessment(studentId: String) {
        appDao.setPendingAssessmentRequest(studentId, true)
        firestore.collection("users").document(studentId).updateFields { "pendingAssessmentRequest" to true }
    }

    fun getAssessmentsForStudent(studentId: String): Flow<List<AssessmentEntity>> =
        appDao.getAssessmentsByStudent(studentId)

    // Trainer-initiated Student invite (GOALS.md §7). Snapshots the draft's fields onto the invite
    // doc so claiming doesn't need a second read of the (soon-to-be-archived) students/{id} draft.
    @OptIn(ExperimentalUuidApi::class)
    suspend fun generateInvite(draft: UserEntity): String {
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
    suspend fun insertBiometric(biometric: BiometricEntity) {
        appDao.insertBiometric(biometric)
        currentTrainerId()?.let {
            firestore.collection("biometrics").document(biometric.id).set(biometric.toFirestoreMap(it))
        }
    }

    fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>> = appDao.getBiometricsByUser(userId)

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

    suspend fun insertWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.insertWorkout(toSave)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(it))
        }
    }

    suspend fun updateWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.updateWorkout(toSave)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(it))
        }
    }

    suspend fun deleteWorkout(workout: WorkoutEntity) {
        appDao.deleteWorkout(workout)
        firestore.collection("workouts").document(workout.id).delete()
    }

    fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>> = appDao.getActiveWorkoutsByStudent(studentId)

    // History — local-only, superseded by workoutLogs (see GOALS.md §4a Product goal #3)
    suspend fun insertHistory(history: HistoryEntity) = appDao.insertHistory(history)

    // Schedules
    suspend fun insertSchedule(schedule: ScheduleEntity) {
        appDao.insertSchedule(schedule)
        currentTrainerId()?.let {
            firestore.collection("schedules").document(schedule.id).set(schedule.toFirestoreMap(it))
        }
    }

    suspend fun deleteSchedule(schedule: ScheduleEntity) {
        appDao.deleteSchedule(schedule)
        firestore.collection("schedules").document(schedule.id).delete()
    }

    suspend fun getAllSchedules() = appDao.getAllSchedules()

    // Workout logs — written by the student after a session (trainerId comes from their own
    // profile, not from auth.currentUser, since the writer here is the student, not the trainer).
    suspend fun insertWorkoutLog(log: WorkoutLogEntity, trainerId: String) {
        appDao.insertWorkoutLog(log)
        firestore.collection("workoutLogs").document(log.id).set(log.toFirestoreMap(trainerId))
    }

    fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>> = appDao.getWorkoutLogsByStudent(studentId)
    suspend fun getWorkoutLogsByWorkout(workoutId: String) = appDao.getWorkoutLogsByWorkout(workoutId)
}
