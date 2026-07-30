package com.example.personalapp.data.repository

import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.HistoryEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrainerRepository @Inject constructor(
    private val appDao: AppDao
) {
    suspend fun insertUser(user: UserEntity) = appDao.insertUser(user)
    suspend fun updateUser(user: UserEntity) = appDao.updateUser(user)
    suspend fun deleteUser(user: UserEntity) = appDao.deleteUser(user)
    fun getStudents(): Flow<List<UserEntity>> = appDao.getStudents()
    suspend fun getUserById(id: String) = appDao.getUserById(id)

    suspend fun insertBiometric(biometric: BiometricEntity) = appDao.insertBiometric(biometric)
    suspend fun getBiometricsByUser(userId: String) = appDao.getBiometricsByUser(userId)

    suspend fun insertWorkout(workout: WorkoutEntity) = appDao.insertWorkout(workout)
    suspend fun updateWorkout(workout: WorkoutEntity) = appDao.updateWorkout(workout)
    suspend fun deleteWorkout(workout: WorkoutEntity) = appDao.deleteWorkout(workout)
    suspend fun getActiveWorkoutsByStudent(studentId: String) = appDao.getActiveWorkoutsByStudent(studentId)

    suspend fun insertHistory(history: HistoryEntity) = appDao.insertHistory(history)

    suspend fun insertSchedule(schedule: ScheduleEntity) = appDao.insertSchedule(schedule)
    suspend fun deleteSchedule(schedule: ScheduleEntity) = appDao.deleteSchedule(schedule)
    suspend fun getAllSchedules() = appDao.getAllSchedules()
}
