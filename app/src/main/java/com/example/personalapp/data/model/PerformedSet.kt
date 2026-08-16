package com.example.personalapp.data.model

import kotlinx.serialization.Serializable

@Serializable
data class PerformedSet(
    val setNumber: Int,
    val weight: String,
    val reps: Int
)
