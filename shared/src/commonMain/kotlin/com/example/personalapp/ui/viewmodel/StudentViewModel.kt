@file:OptIn(kotlin.uuid.ExperimentalUuidApi::class)

package com.example.personalapp.ui.viewmodel
import com.example.personalapp.util.currentTimeMillis

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.PerformedSet
import com.example.personalapp.data.repository.StudentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.uuid.Uuid

class StudentViewModel(
    private val repository: StudentRepository,
) : ViewModel() {

    private var studentId: String = ""
    private var trainerId: String = ""

    private val _workouts = MutableStateFlow<List<WorkoutEntity>>(emptyList())
    val workouts: StateFlow<List<WorkoutEntity>> = _workouts

    private val _biometrics = MutableStateFlow<List<BiometricEntity>>(emptyList())
    val biometrics: StateFlow<List<BiometricEntity>> = _biometrics

    private val _workoutLogs = MutableStateFlow<List<WorkoutLogEntity>>(emptyList())
    val workoutLogs: StateFlow<List<WorkoutLogEntity>> = _workoutLogs

    private val _logSaved = MutableStateFlow(false)
    val logSaved: StateFlow<Boolean> = _logSaved

    fun start(studentId: String, trainerId: String) {
        if (this.studentId == studentId) return
        this.studentId = studentId
        this.trainerId = trainerId
        viewModelScope.launch { repository.getMyWorkouts(studentId).collect { _workouts.value = it } }
        viewModelScope.launch { repository.getMyBiometrics(studentId).collect { _biometrics.value = it } }
        viewModelScope.launch { repository.getMyWorkoutLogs(studentId).collect { _workoutLogs.value = it } }
    }

    fun logSession(workoutId: String, entries: Map<String, List<PerformedSet>>) {
        viewModelScope.launch {
            _logSaved.value = false
            entries.filterValues { it.isNotEmpty() }.forEach { (exerciseName, sets) ->
                repository.logSession(
                    WorkoutLogEntity(
                        id = Uuid.random().toString(),
                        studentId = studentId,
                        workoutId = workoutId,
                        exerciseName = exerciseName,
                        date = currentTimeMillis(),
                        performedSets = sets,
                    ),
                    trainerId,
                )
            }
            _logSaved.value = true
        }
    }

    fun resetLogSaved() {
        _logSaved.value = false
    }
}
