package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.repository.TrainerRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class WorkoutViewModel @Inject constructor(
    private val repository: TrainerRepository
) : ViewModel() {

    private val _workouts = MutableStateFlow<List<WorkoutEntity>>(emptyList())
    val workouts: StateFlow<List<WorkoutEntity>> = _workouts

    fun loadWorkouts(studentId: String) {
        viewModelScope.launch {
            _workouts.value = repository.getActiveWorkoutsByStudent(studentId)
        }
    }

    fun insertWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            repository.insertWorkout(workout)
            loadWorkouts(workout.studentId)
        }
    }

    fun deleteWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            repository.deleteWorkout(workout)
            // Refresh list
            loadWorkouts(workout.studentId)
        }
    }

    fun toggleWorkoutStatus(workout: WorkoutEntity) {
        viewModelScope.launch {
            val updatedWorkout = workout.copy(isActive = !workout.isActive)
            repository.updateWorkout(updatedWorkout)
            // Refresh list
            loadWorkouts(workout.studentId)
        }
    }
}
