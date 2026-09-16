package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.UUID

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
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var activeListeners: List<ListenerRegistration> = emptyList()

    private fun currentTrainerId(): String? = auth.currentUser?.uid

    fun startListening(trainerId: String) {
        stopListening()
        activeListeners = listOf(
            mirror("students", trainerId, DocumentSnapshot::toUserEntity, appDao::insertUser, appDao::deleteUserById),
            mirror("workouts", trainerId, DocumentSnapshot::toWorkoutEntity, appDao::insertWorkout, appDao::deleteWorkoutById),
            mirror("biometrics", trainerId, DocumentSnapshot::toBiometricEntity, appDao::insertBiometric, appDao::deleteBiometricById),
            mirror("schedules", trainerId, DocumentSnapshot::toScheduleEntity, appDao::insertSchedule, appDao::deleteScheduleById),
            mirror("workoutLogs", trainerId, DocumentSnapshot::toWorkoutLogEntity, appDao::insertWorkoutLog, appDao::deleteWorkoutLogById),
            // Linked students live in users/{uid}, not students/{id} — see GOALS.md §7 "unify".
            mirrorQuery(
                firestore.collection("users").whereEqualTo("trainerId", trainerId).whereEqualTo("role", "STUDENT"),
                DocumentSnapshot::toLinkedUserEntity, appDao::insertUser, appDao::deleteUserById,
            ),
        )
    }

    fun stopListening() {
        activeListeners.forEach { it.remove() }
        activeListeners = emptyList()
    }

    private fun <T> mirror(
        collection: String,
        trainerId: String,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): ListenerRegistration = mirrorQuery(firestore.collection(collection).whereEqualTo("trainerId", trainerId), map, upsert, deleteById)

    private fun <T> mirrorQuery(
        query: Query,
        map: (DocumentSnapshot) -> T?,
        upsert: suspend (T) -> Unit,
        deleteById: suspend (String) -> Unit,
    ): ListenerRegistration =
        query.addSnapshotListener { snapshot, error ->
            if (error != null) FirebaseCrashlytics.getInstance().recordException(error)
            val changes = snapshot?.documentChanges ?: return@addSnapshotListener
            scope.launch {
                for (change in changes) {
                    when (change.type) {
                        DocumentChange.Type.ADDED, DocumentChange.Type.MODIFIED ->
                            map(change.document)?.let { upsert(it) }
                        DocumentChange.Type.REMOVED ->
                            deleteById(change.document.id)
                    }
                }
            }
        }

    // Users / Students
    suspend fun insertUser(user: UserEntity) {
        appDao.insertUser(user)
        currentTrainerId()?.let {
            firestore.collection("students").document(user.id).set(user.toFirestoreMap(it)).await()
        }
    }

    suspend fun updateUser(user: UserEntity) {
        appDao.updateUser(user)
        if (user.linked) {
            firestore.collection("users").document(user.id)
                .set(user.toLinkedStudentUpdateMap(), SetOptions.merge()).await()
        } else {
            currentTrainerId()?.let {
                firestore.collection("students").document(user.id).set(user.toFirestoreMap(it)).await()
            }
        }
    }

    suspend fun deleteUser(user: UserEntity) {
        appDao.deleteUser(user)
        val collection = if (user.linked) "users" else "students"
        firestore.collection(collection).document(user.id).delete().await()
    }

    fun getStudents(): Flow<List<UserEntity>> = appDao.getStudents()
    suspend fun getUserById(id: String) = appDao.getUserById(id)

    // Trainer-initiated Student invite (GOALS.md §7). Snapshots the draft's fields onto the invite
    // doc so claiming doesn't need a second read of the (soon-to-be-archived) students/{id} draft.
    suspend fun generateInvite(draft: UserEntity): String {
        val trainerId = currentTrainerId() ?: error("Not authenticated")
        val code = UUID.randomUUID().toString().take(8).uppercase()
        firestore.collection("invites").document(code).set(
            mapOf(
                "trainerId" to trainerId,
                "used" to false,
                "createdAt" to System.currentTimeMillis(),
                "draftId" to draft.id,
                "name" to draft.name,
                "phone" to draft.phone,
                "gender" to draft.gender,
                "goal" to draft.goal,
                "experienceLevel" to draft.experienceLevel,
                "medicalNotes" to draft.medicalNotes,
                "trainingDays" to draft.trainingDays,
            )
        ).await()
        return code
    }

    // Biometrics
    suspend fun insertBiometric(biometric: BiometricEntity) {
        appDao.insertBiometric(biometric)
        currentTrainerId()?.let {
            firestore.collection("biometrics").document(biometric.id).set(biometric.toFirestoreMap(it)).await()
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
        copy(status = "assigned", assignedAt = assignedAt ?: System.currentTimeMillis())
    } else {
        copy(status = "draft", assignedAt = null)
    }

    suspend fun insertWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.insertWorkout(toSave)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(it)).await()
        }
    }

    suspend fun updateWorkout(workout: WorkoutEntity) {
        val toSave = workout.withDerivedStatus()
        appDao.updateWorkout(toSave)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(toSave.id).set(toSave.toFirestoreMap(it)).await()
        }
    }

    suspend fun deleteWorkout(workout: WorkoutEntity) {
        appDao.deleteWorkout(workout)
        firestore.collection("workouts").document(workout.id).delete().await()
    }

    fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>> = appDao.getActiveWorkoutsByStudent(studentId)

    // History — local-only, superseded by workoutLogs (see GOALS.md §4a Product goal #3)
    suspend fun insertHistory(history: HistoryEntity) = appDao.insertHistory(history)

    // Schedules
    suspend fun insertSchedule(schedule: ScheduleEntity) {
        appDao.insertSchedule(schedule)
        currentTrainerId()?.let {
            firestore.collection("schedules").document(schedule.id).set(schedule.toFirestoreMap(it)).await()
        }
    }

    suspend fun deleteSchedule(schedule: ScheduleEntity) {
        appDao.deleteSchedule(schedule)
        firestore.collection("schedules").document(schedule.id).delete().await()
    }

    suspend fun getAllSchedules() = appDao.getAllSchedules()

    // Workout logs — written by the student after a session (trainerId comes from their own
    // profile, not from auth.currentUser, since the writer here is the student, not the trainer).
    suspend fun insertWorkoutLog(log: WorkoutLogEntity, trainerId: String) {
        appDao.insertWorkoutLog(log)
        firestore.collection("workoutLogs").document(log.id).set(log.toFirestoreMap(trainerId)).await()
    }

    fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>> = appDao.getWorkoutLogsByStudent(studentId)
    suspend fun getWorkoutLogsByWorkout(workoutId: String) = appDao.getWorkoutLogsByWorkout(workoutId)
}
