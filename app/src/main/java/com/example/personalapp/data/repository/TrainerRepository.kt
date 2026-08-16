package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.DocumentChange
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firestore is the source of truth (see GOALS.md §4a): writes here go to Firestore first,
 * a snapshot listener (started via [startListening]) mirrors each trainer-scoped collection
 * back into Room, and every screen keeps reading from Room's Flows as before.
 */
@Singleton
class TrainerRepository @Inject constructor(
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
    ): ListenerRegistration =
        firestore.collection(collection)
            .whereEqualTo("trainerId", trainerId)
            .addSnapshotListener { snapshot, _ ->
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
        currentTrainerId()?.let {
            firestore.collection("students").document(user.id).set(user.toFirestoreMap(it)).await()
        }
    }

    suspend fun deleteUser(user: UserEntity) {
        appDao.deleteUser(user)
        firestore.collection("students").document(user.id).delete().await()
    }

    fun getStudents(): Flow<List<UserEntity>> = appDao.getStudents()
    suspend fun getUserById(id: String) = appDao.getUserById(id)

    // Biometrics
    suspend fun insertBiometric(biometric: BiometricEntity) {
        appDao.insertBiometric(biometric)
        currentTrainerId()?.let {
            firestore.collection("biometrics").document(biometric.id).set(biometric.toFirestoreMap(it)).await()
        }
    }

    fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>> = appDao.getBiometricsByUser(userId)

    // Workouts
    suspend fun insertWorkout(workout: WorkoutEntity) {
        appDao.insertWorkout(workout)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(workout.id).set(workout.toFirestoreMap(it)).await()
        }
    }

    suspend fun updateWorkout(workout: WorkoutEntity) {
        appDao.updateWorkout(workout)
        currentTrainerId()?.let {
            firestore.collection("workouts").document(workout.id).set(workout.toFirestoreMap(it)).await()
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
