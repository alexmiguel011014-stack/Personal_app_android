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

    // Biometric Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBiometric(biometric: BiometricEntity)

    @Query("SELECT * FROM biometrics WHERE userId = :userId ORDER BY date DESC")
    suspend fun getBiometricsByUser(userId: String): List<BiometricEntity>

    // Workout Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWorkout(workout: WorkoutEntity)

    @Update
    suspend fun updateWorkout(workout: WorkoutEntity)

    @Delete
    suspend fun deleteWorkout(workout: WorkoutEntity)

    @Query("SELECT * FROM workouts WHERE studentId = :studentId AND isActive = 1")
    suspend fun getActiveWorkoutsByStudent(studentId: String): List<WorkoutEntity>

    // History Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertHistory(history: HistoryEntity)

    // Schedule Operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSchedule(schedule: ScheduleEntity)

    @Delete
    suspend fun deleteSchedule(schedule: ScheduleEntity)

    @Query("SELECT * FROM schedules")
    suspend fun getAllSchedules(): List<ScheduleEntity>
}
