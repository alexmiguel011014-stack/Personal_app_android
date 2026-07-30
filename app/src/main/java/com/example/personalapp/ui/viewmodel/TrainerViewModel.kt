package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.repository.TrainerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class TrainerViewModel @Inject constructor(
    private val repository: TrainerRepository
) : ViewModel() {

    val students: StateFlow<List<UserEntity>> = repository.getStudents()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _selectedStudentId = MutableStateFlow<String?>(null)
    val selectedStudentId: StateFlow<String?> = _selectedStudentId

    private val _schedules = MutableStateFlow<List<ScheduleEntity>>(emptyList())
    val schedules: StateFlow<List<ScheduleEntity>> = _schedules

    init {
        loadSchedules()
    }

    fun loadSchedules() {
        viewModelScope.launch {
            _schedules.value = repository.getAllSchedules()
        }
    }

    fun selectStudent(id: String?) {
        _selectedStudentId.value = id
    }

    fun addStudent(
        name: String,
        phone: String,
        gender: String,
        goal: String,
        level: String,
        notes: String,
        trainingDays: List<String>,
        weight: Double,
        height: Double
    ) {
        viewModelScope.launch {
            val studentId = UUID.randomUUID().toString()
            val now = System.currentTimeMillis()
            
            val newUser = UserEntity(
                id = studentId,
                name = name,
                role = "student",
                gender = gender,
                phone = phone,
                goal = goal,
                experienceLevel = level,
                medicalNotes = notes,
                trainingDays = trainingDays,
                createdAt = now
            )
            
            repository.insertUser(newUser)
            
            // Initial biometric entry
            if (weight > 0 || height > 0) {
                val biometric = BiometricEntity(
                    id = UUID.randomUUID().toString(),
                    userId = studentId,
                    weight = weight,
                    height = height,
                    bodyFat = 0.0,
                    date = now
                )
                repository.insertBiometric(biometric)
            }
        }
    }

    fun bookSlot(day: String, hour: String) {
        val studentId = _selectedStudentId.value ?: return
        viewModelScope.launch {
            val schedule = ScheduleEntity(
                id = UUID.randomUUID().toString(),
                studentId = studentId,
                dayOfWeek = day,
                hour = hour
            )
            repository.insertSchedule(schedule)
            loadSchedules()
        }
    }
}
