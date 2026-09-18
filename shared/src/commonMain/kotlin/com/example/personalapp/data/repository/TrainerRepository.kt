package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.util.nowMillis
import com.example.personalapp.util.randomUuidString
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
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

/**
 * Firestore is the source of truth (see GOALS.md §4a): writes here go to Firestore first,
 * a snapshot listener (started via [startListening]) mirrors each trainer-scoped collection
 * back into Room, and every screen keeps reading from Room's Flows as before.
 *
 * GOALS.md §18f: built on the GitLive Firebase KMP SDK. Its snapshot listeners are Flows
 * ([Query.snapshots]) rather than callback registrations, so "listening" here is a collecting
 * coroutine per collection and [stopListening] cancels those jobs.
 */
class TrainerRepository(
    private val appDao: AppDao,
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var activeListeners: List<Job> = emptyList()

    private fun currentTrainerId(): String? = auth.currentUser?.uid

    fun startListening(trainerId: String) {
        stopListening()
        activeListeners = listOf(
            mirror("students", trainerId, DocumentSnapshot::toUserEntity, appDao::insertUser, appDao::deleteUserById),
            mirror("workouts", trainerId, DocumentSnapshot::toWorkoutEntity, appDao::insertWorkout, appDao::deleteWorkoutById),
            mirror("biometrics", trainerId, DocumentSnapshot::toBiometricEntity, appDao::insertBiometric, appDao::deleteBiometricById),
            mirror("schedules", trainerId, DocumentSnapshot::toScheduleEntity, appDao::insertSchedule, appDao::deleteScheduleById),
            mirror("workoutLogs", trainerId, DocumentSnapshot::toWorkoutLogEntity, appDao::insertWorkoutLog, appDao::deleteWorkoutLogById),
            mirror("assessments", trainerId, DocumentSnapshot::toAssessmentEntity, appDao::insertAssessment, appDao::deleteAssessmentById),
            // Linked students live in users/{uid}, not students/{id} — see GOALS.md §7 "unify".
            mirrorQuery(
                firestore.collection("users").where {
                    all("trainerId" equalTo trainerId, "role" equalTo "STUDENT")
                },
                DocumentSnapshot::toLinkedUserEntity, appDao::insertUser, appDao::deleteUserById,
            ),
        )
    }

    fun stopListening() {
        activeListeners.forEach { it.cancel() }
        activeListeners = emptyList()
    }

    private fun <T> mirror(
        collection: String,
        trainerId: String,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): Job = mirrorQuery(
        firestore.collection(collection).where { "trainerId" equalTo trainerId },
        map, upsert, deleteById,
    )

    private fun <T> mirrorQuery(
        query: Query,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): Job = query.snapshots
        .onEach { snapshot ->
            for (change in snapshot.documentChanges) {
                when (change.type) {
                    ChangeType.ADDED, ChangeType.MODIFIED -> map(change.document)?.let { upsert(it) }
                    ChangeType.REMOVED -> deleteById(change.document.id)
                }
            }
        }
        .catch { Firebase.crashlytics.recordException(it) }
        .launchIn(scope)

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
    fun observeUserById(id: String): Flow<UserEntity?> = appDao.observeUserById(id)

    // GOALS.md §17: trainer-granted permissions on a *linked* student's own users/{uid} doc. A
    // targeted field update, not a set(merge) of the whole profile, so nothing else on the doc is
    // touched; firestore.rules only lets the owning trainer write these keys.
    suspend fun setStudentPermissions(student: UserEntity, canSelfAssess: Boolean, canLogBiometrics: Boolean) {
        require(student.linked) { "Permissões só se aplicam a alunos conectados" }
        appDao.updateUser(student.copy(canSelfAssess = canSelfAssess, canLogBiometrics = canLogBiometrics))
        firestore.collection("users").document(student.id).updateFields {
            "canSelfAssess" to canSelfAssess
            "canLogBiometrics" to canLogBiometrics
        }
    }

    // Pull-based request (GOALS.md §17a): flips a flag the student's own profile listener picks up
    // next time they open the app — no push infrastructure. Cleared by the student's submission.
    suspend fun requestAssessment(student: UserEntity) {
        require(student.linked && student.canSelfAssess) { "Aluno precisa estar conectado e com autoavaliação liberada" }
        appDao.updateUser(student.copy(pendingAssessmentRequest = true))
        firestore.collection("users").document(student.id).updateFields {
            "pendingAssessmentRequest" to true
        }
    }

    fun getAssessmentsForStudent(studentId: String): Flow<List<AssessmentEntity>> = appDao.getAssessmentsByStudent(studentId)

    // Trainer-initiated Student invite (GOALS.md §7). Snapshots the draft's fields onto the invite
    // doc so claiming doesn't need a second read of the (soon-to-be-archived) students/{id} draft.
    suspend fun generateInvite(draft: UserEntity): String {
        val trainerId = currentTrainerId() ?: error("Not authenticated")
        val code = randomUuidString().take(8).uppercase()
        firestore.collection("invites").document(code).set(
            mapOf(
                "trainerId" to trainerId,
                "used" to false,
                "createdAt" to nowMillis(),
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
        copy(status = "assigned", assignedAt = assignedAt ?: nowMillis())
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
