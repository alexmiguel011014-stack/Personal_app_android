package com.example.personalapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "schedules")
data class ScheduleEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val dayOfWeek: String, // ex: "Segunda"
    val hour: String // ex: "08h"
)
