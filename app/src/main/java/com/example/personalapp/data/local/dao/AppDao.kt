package com.example.personalapp.data.local.dao

import androidx.room.*
import com.example.personalapp.data.local.entity.*
import kotlinx.coroutines.flow.Flow

@Dao
interface AppDao {

    // User Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertUser(user: UserEntity)

    @Update
    suspend fun updateUser(user: UserEntity)

    @Delete
    suspend fun deleteUser(user: UserEntity)

    @Query("SELECT * FROM users WHERE role = 'student'")
    fun getStudents(): Flow<List<UserEntity>>

    @Query("SELECT * FROM users WHERE id = :id")
    suspend fun getUserById(id: String): UserEntity?

    @Query("DELETE FROM users WHERE id = :id")
    suspend fun deleteUserById(id: String)

    // Biometric Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBiometric(biometric: BiometricEntity)

    @Query("SELECT * FROM biometrics WHERE userId = :userId ORDER BY date DESC")
    fun getBiometricsByUser(userId: String): Flow<List<BiometricEntity>>

    @Query("DELETE FROM biometrics WHERE id = :id")
    suspend fun deleteBiometricById(id: String)

    // Workout Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: WorkoutEntity)

    @Update
    suspend fun updateWorkout(workout: WorkoutEntity)

    @Delete
    suspend fun deleteWorkout(workout: WorkoutEntity)

    @Query("DELETE FROM workouts WHERE id = :id")
    suspend fun deleteWorkoutById(id: String)

    @Query("SELECT * FROM workouts WHERE studentId = :studentId AND isActive = 1")
    fun getActiveWorkoutsByStudent(studentId: String): Flow<List<WorkoutEntity>>

    // History Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertHistory(history: HistoryEntity)

    // Schedule Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSchedule(schedule: ScheduleEntity)

    @Delete
    suspend fun deleteSchedule(schedule: ScheduleEntity)

    @Query("DELETE FROM schedules WHERE id = :id")
    suspend fun deleteScheduleById(id: String)

    @Query("SELECT * FROM schedules")
    suspend fun getAllSchedules(): List<ScheduleEntity>

    // Workout Log Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkoutLog(log: WorkoutLogEntity)

    @Delete
    suspend fun deleteWorkoutLog(log: WorkoutLogEntity)

    @Query("DELETE FROM workout_logs WHERE id = :id")
    suspend fun deleteWorkoutLogById(id: String)

    @Query("SELECT * FROM workout_logs WHERE studentId = :studentId ORDER BY date DESC")
    fun getWorkoutLogsByStudent(studentId: String): Flow<List<WorkoutLogEntity>>

    @Query("SELECT * FROM workout_logs WHERE workoutId = :workoutId ORDER BY date DESC")
    suspend fun getWorkoutLogsByWorkout(workoutId: String): List<WorkoutLogEntity>
}
