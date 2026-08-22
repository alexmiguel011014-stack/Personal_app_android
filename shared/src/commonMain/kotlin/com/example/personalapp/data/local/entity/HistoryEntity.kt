package com.example.personalapp.data.local.entity

data class HistoryEntity(
    val id: String,
    val studentId: String,
    val workoutId: String,
    val intensity: Int,
    val date: Long
)
