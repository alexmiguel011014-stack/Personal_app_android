package com.example.personalapp.data.local.entity

import androidx.room3.Entity
import androidx.room3.PrimaryKey

@Entity(tableName = "schedules")
data class ScheduleEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val dayOfWeek: String, // ex: "Segunda"
    val hour: String // ex: "08h"
)
