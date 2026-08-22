package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.repository.TrainerRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

class WorkoutViewModel(
    private val repository: TrainerRepository
) : ViewModel() {

    private val _workouts = MutableStateFlow<List<WorkoutEntity>>(emptyList())
    val workouts: StateFlow<List<WorkoutEntity>> = _workouts

    fun loadWorkouts(studentId: String) {
        repository.getActiveWorkoutsByStudent(studentId).onEach { _workouts.value = it }.launchIn(viewModelScope)
    }

    fun insertWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            repository.insertWorkout(workout)
        }
    }

    fun deleteWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            repository.deleteWorkout(workout)
        }
    }

    fun toggleWorkoutStatus(workout: WorkoutEntity) {
        viewModelScope.launch {
            repository.updateWorkout(workout.copy(isActive = !workout.isActive))
        }
    }
}
