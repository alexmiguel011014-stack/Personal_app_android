package com.example.personalapp.data.local.dao

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import com.example.personalapp.data.local.AppDatabase
import com.example.personalapp.data.local.DatabaseDriverFactory
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.local.exerciseListAdapter
import com.example.personalapp.data.local.performedSetListAdapter
import com.example.personalapp.data.local.stringListAdapter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow

// GOALS.md §18d: replaces the old Room @Dao interface — same method names/signatures as before
// (TrainerRepository/StudentRepository call these unchanged), backed by SQLDelight instead of
// Room (Room 3.0's KSP processor hit a confirmed, reproducible upstream bug — see GOALS.md §18d).
class AppDao(driverFactory: DatabaseDriverFactory) {
    private val driver = driverFactory.createDriver()
    private val database = AppDatabase(
        driver = driver,
        workoutsAdapter = com.example.personalapp.data.local.Workouts.Adapter(
            exercisesJsonAdapter = exerciseListAdapter,
        ),
        workout_logsAdapter = com.example.personalapp.data.local.Workout_logs.Adapter(performedSetsJsonAdapter = performedSetListAdapter),
        usersAdapter = com.example.personalapp.data.local.Users.Adapter(
            trainingDaysAdapter = stringListAdapter,
        ),
    )

    fun close() = driver.close()

    // --- Users ---
    suspend fun insertUser(user: UserEntity) {
        database.usersQueries.insertUser(
            id = user.id, name = user.name, role = user.role, gender = user.gender,
            phone = user.phone, goal = user.goal, experienceLevel = user.experienceLevel,
            medicalNotes = user.medicalNotes, trainingDays = user.trainingDays,
            createdAt = user.createdAt, linked = user.linked,
        )
    }

    suspend fun updateUser(user: UserEntity) {
        database.usersQueries.updateUser(
            name = user.name, role = user.role, gender = user.gender, phone = user.phone,
            goal = user.goal, experienceLevel = user.experienceLevel,
            medicalNotes = user.medicalNotes, trainingDays = user.trainingDays,
            createdAt = user.createdAt, linked = user.linked, id = user.id,
        )
    }

    suspend fun deleteUser(user: UserEntity) = deleteUserById(user.id)

    fun getStudents(): Flow<List<UserEntity>> =
        database.usersQueries.getStudents(::toUserEntity).asFlow().mapToList(Dispatchers.Default)

    suspend fun getUserById(id: String): UserEntity? =
        database.usersQueries.getUserById(id, ::toUserEntity).executeAsOneOrNull()

    suspend fun deleteUserById(id: String) {
        database.usersQueries.deleteUser(id)
    }

    private fun toUserEntity(
        id: String, name: String, role: String, gender: String, phone: String, goal: String,
        experienceLevel: String, medicalNotes: String, trainingDays: List<String>,
        createdAt: Long, linked: Boolean,
    ) = UserEntity(id, name, role, gender, phone, goal, experienceLevel, medicalNotes, trainingDays, createdAt, linked)

    // --- Biometrics ---
    suspend fun insertBiometric(biometric: BiometricEntity) {
        database.biometricsQueries.insertBiometric(
            biometric.id, biometric.userId, biometric.weight, biometric.height,
            biometric.bodyFat, biometric.date,
        )
    }

    fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>> =
        database.biometricsQueries.getBiometricsByUser(userId, ::BiometricEntity)
            .asFlow().mapToList(Dispatchers.Default)

    suspend fun deleteBiometricById(id: String) {
        database.biometricsQueries.deleteBiometricById(id)
    }

    // --- Workouts ---
    suspend fun insertWorkout(workout: WorkoutEntity) {
        database.workoutsQueries.insertWorkout(
            id = workout.id, studentId = workout.studentId, name = workout.name,
            isActive = workout.isActive, exercisesJson = workout.exercises,
            createdAt = workout.createdAt, status = workout.status, assignedAt = workout.assignedAt,
        )
    }

    suspend fun updateWorkout(workout: WorkoutEntity) {
        database.workoutsQueries.updateWorkout(
            studentId = workout.studentId, name = workout.name, isActive = workout.isActive,
            exercisesJson = workout.exercises, createdAt = workout.createdAt,
            status = workout.status, assignedAt = workout.assignedAt, id = workout.id,
        )
    }

    suspend fun deleteWorkout(workout: WorkoutEntity) = deleteWorkoutById(workout.id)

    suspend fun deleteWorkoutById(id: String) {
        database.workoutsQueries.deleteWorkoutById(id)
    }

    fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>> =
        database.workoutsQueries.getActiveWorkoutsByStudent(studentId, ::toWorkoutEntity)
            .asFlow().mapToList(Dispatchers.Default)

    private fun toWorkoutEntity(
        id: String, studentId: String, name: String, isActive: Boolean,
        exercises: List<com.example.personalapp.data.model.Exercise>, createdAt: Long,
        status: String, assignedAt: Long?,
    ) = WorkoutEntity(id, studentId, name, isActive, exercises, createdAt, status, assignedAt)

    // --- History ---
    suspend fun insertHistory(history: HistoryEntity) {
        database.historyQueries.insertHistory(
            history.id, history.studentId, history.workoutId, history.intensity.toLong(), history.date,
        )
    }

    // --- Schedules ---
    suspend fun insertSchedule(schedule: ScheduleEntity) {
        database.schedulesQueries.insertSchedule(
            schedule.id, schedule.studentId, schedule.dayOfWeek, schedule.hour,
        )
    }

    suspend fun deleteSchedule(schedule: ScheduleEntity) = deleteScheduleById(schedule.id)

    suspend fun deleteScheduleById(id: String) {
        database.schedulesQueries.deleteScheduleById(id)
    }

    suspend fun getAllSchedules(): List<ScheduleEntity> =
        database.schedulesQueries.getAllSchedules(::ScheduleEntity).executeAsList()

    // --- Workout logs ---
    suspend fun insertWorkoutLog(log: WorkoutLogEntity) {
        database.workoutLogsQueries.insertWorkoutLog(
            id = log.id, studentId = log.studentId, workoutId = log.workoutId,
            exerciseName = log.exerciseName, date = log.date,
            performedSetsJson = log.performedSets, note = log.note,
        )
    }

    suspend fun deleteWorkoutLog(log: WorkoutLogEntity) = deleteWorkoutLogById(log.id)

    suspend fun deleteWorkoutLogById(id: String) {
        database.workoutLogsQueries.deleteWorkoutLogById(id)
    }

    fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>> =
        database.workoutLogsQueries.getWorkoutLogsByStudent(studentId, ::toWorkoutLogEntity)
            .asFlow().mapToList(Dispatchers.Default)

    suspend fun getWorkoutLogsByWorkout(workoutId: String): List<WorkoutLogEntity> =
        database.workoutLogsQueries.getWorkoutLogsByWorkout(workoutId, ::toWorkoutLogEntity).executeAsList()

    private fun toWorkoutLogEntity(
        id: String, studentId: String, workoutId: String, exerciseName: String, date: Long,
        performedSets: List<com.example.personalapp.data.model.PerformedSet>, note: String?,
    ) = WorkoutLogEntity(id, studentId, workoutId, exerciseName, date, performedSets, note)
}
