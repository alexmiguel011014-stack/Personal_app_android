package com.example.personalapp.data.local.entity

import androidx.room3.Entity
import androidx.room3.PrimaryKey

@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val workoutId: String,
    val intensity: Int,
    val date: Long
)
