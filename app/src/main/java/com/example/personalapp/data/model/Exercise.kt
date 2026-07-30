package com.example.personalapp.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Exercise(
    val name: String,
    val sets: Int,
    val reps: String, // String to allow "10-12" or "Exhaustion"
    val weight: String? = null,
    val restSeconds: Int? = null,
    val notes: String? = null
)
