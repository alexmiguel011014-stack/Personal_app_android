package com.example.personalapp.data.local.entity

import com.example.personalapp.data.model.PerformedSet

data class WorkoutLogEntity(
    val id: String,
    val studentId: String,
    val workoutId: String,
    val exerciseName: String,
    val date: Long,
    val performedSets: List<PerformedSet>,
    val note: String? = null,
)
