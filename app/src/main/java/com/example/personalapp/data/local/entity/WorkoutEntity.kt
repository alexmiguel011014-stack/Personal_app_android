package com.example.personalapp.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
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
