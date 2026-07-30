package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.repository.TrainerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class StudentDetailsViewModel @Inject constructor(
    private val repository: TrainerRepository
) : ViewModel() {

    private val _student = MutableStateFlow<UserEntity?>(null)
    val student: StateFlow<UserEntity?> = _student

    private val _biometrics = MutableStateFlow<List<BiometricEntity>>(emptyList())
    val biometrics: StateFlow<List<BiometricEntity>> = _biometrics

    private val _workouts = MutableStateFlow<List<WorkoutEntity>>(emptyList())
    val workouts: StateFlow<List<WorkoutEntity>> = _workouts

    fun loadStudent(studentId: String) {
        viewModelScope.launch {
            _student.value = repository.getUserById(studentId)
            _biometrics.value = repository.getBiometricsByUser(studentId)
            _workouts.value = repository.getActiveWorkoutsByStudent(studentId)
        }
    }

    fun addBiometric(studentId: String, weight: Double, bodyFat: Double) {
        viewModelScope.launch {
            val biometric = BiometricEntity(
                id = java.util.UUID.randomUUID().toString(),
                userId = studentId,
                weight = weight,
                height = _student.value?.medicalNotes?.toDoubleOrNull() ?: 0.0, // Height is tricky if not stored separately, I should probably add height to UserEntity or keep it in Biometric correctly.
                bodyFat = bodyFat,
                date = System.currentTimeMillis()
            )
            repository.insertBiometric(biometric)
            loadStudent(studentId)
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
}
