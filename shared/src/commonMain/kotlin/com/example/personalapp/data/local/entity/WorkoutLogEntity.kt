package com.example.personalapp.data.local.entity

import androidx.room3.ColumnInfo
import androidx.room3.Entity
import androidx.room3.PrimaryKey
import com.example.personalapp.data.model.PerformedSet

@Entity(tableName = "workout_logs")
data class WorkoutLogEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val workoutId: String,
    val exerciseName: String,
    val date: Long,
    @ColumnInfo(name = "performedSetsJson") val performedSets: List<PerformedSet>,
    val note: String? = null,
)
