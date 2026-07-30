package com.example.personalapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "history")
data class HistoryEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val workoutId: String,
    val intensity: Int,
    val date: Long
)
