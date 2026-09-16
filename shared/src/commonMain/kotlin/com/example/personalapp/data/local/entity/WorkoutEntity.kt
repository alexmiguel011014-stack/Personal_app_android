package com.example.personalapp.data.local.entity

import androidx.room3.ColumnInfo
import androidx.room3.Entity
import androidx.room3.PrimaryKey
import com.example.personalapp.data.model.Exercise

@Entity(tableName = "workouts")
data class WorkoutEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val name: String,
    val isActive: Boolean,
    @ColumnInfo(name = "exercisesJson") val exercises: List<Exercise>,
    val createdAt: Long,
    val status: String = "draft", // 'draft' or 'assigned'
    val assignedAt: Long? = null,
)
