package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import kotlinx.coroutines.flow.Flow

/**
 * GOALS.md §19c: extracted to an interface so web (no SQLDelight offline cache, see §19a's scope
 * cut) can supply a Firestore-direct implementation ([FirestoreTrainerRepository]) without any
 * ViewModel/screen needing to know which one it's talking to. Android/iOS keep using
 * [SqlDelightTrainerRepository] — same behavior as before this split, just renamed.
 *
 * Firestore is the source of truth (see GOALS.md §4a): [SqlDelightTrainerRepository]'s writes go
 * to Firestore first, a snapshot listener (started via [startListening]) mirrors each
 * trainer-scoped collection back into the local SQLDelight database, and every screen keeps
 * reading from those Flows as before. [FirestoreTrainerRepository] skips the local mirror
 * entirely and reads/writes Firestore directly.
 */
interface TrainerRepository {
    fun startListening(trainerId: String)
    fun stopListening()

    // Users / Students
    suspend fun insertUser(user: UserEntity)
    suspend fun updateUser(user: UserEntity)
    suspend fun deleteUser(user: UserEntity)
    fun getStudents(): Flow<List<UserEntity>>
    suspend fun getUserById(id: String): UserEntity?

    // GOALS.md §17: trainer-granted, default-off permissions on a *linked* student.
    suspend fun setStudentPermission(studentId: String, canSelfAssess: Boolean, canLogBiometrics: Boolean)

    // Pull-based request (GOALS.md §17a).
    suspend fun requestAssessment(studentId: String)
    fun getAssessmentsForStudent(studentId: String): Flow<List<AssessmentEntity>>

    // Trainer-initiated Student invite (GOALS.md §7).
    suspend fun generateInvite(draft: UserEntity): String

    // Biometrics
    suspend fun insertBiometric(biometric: BiometricEntity)
    fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>>

    // Workouts
    suspend fun insertWorkout(workout: WorkoutEntity)
    suspend fun updateWorkout(workout: WorkoutEntity)
    suspend fun deleteWorkout(workout: WorkoutEntity)
    fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>>
    suspend fun getWorkoutById(id: String): WorkoutEntity?

    // History — local-only, superseded by workoutLogs (see GOALS.md §4a Product goal #3).
    suspend fun insertHistory(history: HistoryEntity)

    // Schedules
    suspend fun insertSchedule(schedule: ScheduleEntity)
    suspend fun deleteSchedule(schedule: ScheduleEntity)
    suspend fun getAllSchedules(): List<ScheduleEntity>

    // Workout logs — written by the student after a session (trainerId comes from their own
    // profile, not from auth.currentUser, since the writer here is the student, not the trainer).
    suspend fun insertWorkoutLog(log: WorkoutLogEntity, trainerId: String)
    fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>>
    suspend fun getWorkoutLogsByWorkout(workoutId: String): List<WorkoutLogEntity>
}
