package com.example.personalapp.data.local.entity

import com.example.personalapp.data.model.Exercise

data class WorkoutEntity(
    val id: String,
    val studentId: String,
    val name: String,
    val isActive: Boolean,
    val exercises: List<Exercise>,
    val createdAt: Long,
    val status: String = "draft", // 'draft' or 'assigned'
    val assignedAt: Long? = null,
)
