package com.example.personalapp.data.model

import kotlinx.serialization.Serializable

// Shape the AI-generation prompt asks providers to return (see GenerativeAiService's
// buildPrompt()); AIWorkoutViewModel.tryParseWorkouts() decodes it from the raw response.
@Serializable
data class AIWorkoutResponse(
    val workouts: List<AIWorkout>
)

@Serializable
data class AIWorkout(
    val name: String,
    val exercises: List<AIExercise>
)

@Serializable
data class AIExercise(
    val name: String,
    val sets: Int,
    val reps: String,
    val weight: String? = null,
    val notes: String? = null
)
