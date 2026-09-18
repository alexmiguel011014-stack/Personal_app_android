package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.PerformedSet
import com.example.personalapp.data.repository.StudentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import com.example.personalapp.util.randomUuidString
import com.example.personalapp.util.nowMillis

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

    // GOALS.md §17e: the student's own users/{uid} doc — trainer-granted flags + the pending
    // assessment request. Null until the first snapshot arrives (or if the doc can't be read).
    private val _profile = MutableStateFlow<UserEntity?>(null)
    val profile: StateFlow<UserEntity?> = _profile

    private val _assessmentSaved = MutableStateFlow(false)
    val assessmentSaved: StateFlow<Boolean> = _assessmentSaved

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError

    fun start(studentId: String, trainerId: String) {
        if (this.studentId == studentId) return
        this.studentId = studentId
        this.trainerId = trainerId
        viewModelScope.launch { repository.getMyProfile(studentId).collect { _profile.value = it } }
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
                        id = randomUuidString(),
                        studentId = studentId,
                        workoutId = workoutId,
                        exerciseName = exerciseName,
                        date = nowMillis(),
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

    // GOALS.md §17e: one assessment doc + clearing the request flag, in one batch (see
    // StudentRepository.submitAssessment for the rule that ties them together).
    fun submitAssessment(parQAnswers: Map<String, Boolean>, goal: String, experienceLevel: String, trainingDays: List<String>) {
        viewModelScope.launch {
            _assessmentSaved.value = false
            try {
                repository.submitAssessment(
                    AssessmentEntity(
                        id = randomUuidString(),
                        studentId = studentId,
                        trainerId = trainerId,
                        submittedAt = nowMillis(),
                        parQAnswers = parQAnswers,
                        goal = goal,
                        experienceLevel = experienceLevel,
                        trainingDays = trainingDays,
                    )
                )
                _assessmentSaved.value = true
                _actionError.value = null
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Falha ao enviar a autoavaliação"
            }
        }
    }

    fun resetAssessmentSaved() {
        _assessmentSaved.value = false
    }

    // GOALS.md §17e: student-logged measurement, same shape the trainer's AddBiometricDialog
    // produces (height isn't collected there either).
    fun logOwnBiometric(weight: Double, bodyFat: Double) {
        viewModelScope.launch {
            try {
                repository.logOwnBiometric(
                    BiometricEntity(
                        id = randomUuidString(),
                        userId = studentId,
                        weight = weight,
                        height = 0.0,
                        bodyFat = bodyFat,
                        date = nowMillis(),
                    ),
                    trainerId,
                )
                _actionError.value = null
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Falha ao registrar a medida"
            }
        }
    }

    fun clearActionError() {
        _actionError.value = null
    }
}
