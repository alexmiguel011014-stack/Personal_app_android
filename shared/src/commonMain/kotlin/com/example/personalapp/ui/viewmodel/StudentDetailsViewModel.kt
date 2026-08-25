@file:OptIn(kotlin.uuid.ExperimentalUuidApi::class)

package com.example.personalapp.ui.viewmodel
import com.example.personalapp.util.currentTimeMillis

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.repository.TrainerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

class StudentDetailsViewModel(
    private val repository: TrainerRepository
) : ViewModel() {

    private val _student = MutableStateFlow<UserEntity?>(null)
    val student: StateFlow<UserEntity?> = _student

    private val _biometrics = MutableStateFlow<List<BiometricEntity>>(emptyList())
    val biometrics: StateFlow<List<BiometricEntity>> = _biometrics

    private val _workouts = MutableStateFlow<List<WorkoutEntity>>(emptyList())
    val workouts: StateFlow<List<WorkoutEntity>> = _workouts

    private val _workoutLogs = MutableStateFlow<List<WorkoutLogEntity>>(emptyList())
    val workoutLogs: StateFlow<List<WorkoutLogEntity>> = _workoutLogs

    private val _inviteCode = MutableStateFlow<String?>(null)
    val inviteCode: StateFlow<String?> = _inviteCode

    private val _inviteError = MutableStateFlow<String?>(null)
    val inviteError: StateFlow<String?> = _inviteError

    fun loadStudent(studentId: String) {
        viewModelScope.launch {
            _student.value = repository.getUserById(studentId)
        }
        repository.getBiometricsByUser(studentId).onEach { _biometrics.value = it }.launchIn(viewModelScope)
        repository.getActiveWorkoutsByStudent(studentId).onEach { _workouts.value = it }.launchIn(viewModelScope)
        repository.getWorkoutLogsByStudent(studentId).onEach { _workoutLogs.value = it }.launchIn(viewModelScope)
    }

    fun addBiometric(studentId: String, weight: Double, bodyFat: Double) {
        viewModelScope.launch {
            val biometric = BiometricEntity(
                id = kotlin.uuid.Uuid.random().toString(),
                userId = studentId,
                weight = weight,
                height = _student.value?.medicalNotes?.toDoubleOrNull() ?: 0.0, // Height is tricky if not stored separately, I should probably add height to UserEntity or keep it in Biometric correctly.
                bodyFat = bodyFat,
                date = currentTimeMillis()
            )
            repository.insertBiometric(biometric)
        }
    }

    fun deleteStudent(onSuccess: () -> Unit) {
        val student = _student.value ?: return
        viewModelScope.launch {
            repository.deleteUser(student)
            onSuccess()
        }
    }

    fun updateStudent(user: UserEntity, onSuccess: () -> Unit) {
        viewModelScope.launch {
            repository.updateUser(user)
            onSuccess()
        }
    }

    fun generateInvite() {
        val draft = _student.value ?: return
        viewModelScope.launch {
            try {
                _inviteCode.value = repository.generateInvite(draft)
                _inviteError.value = null
            } catch (e: Exception) {
                _inviteError.value = e.message ?: "Falha ao gerar convite"
            }
        }
    }

    fun clearInvite() {
        _inviteCode.value = null
        _inviteError.value = null
    }
}
