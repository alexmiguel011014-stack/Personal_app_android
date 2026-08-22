package com.example.personalapp.data.local.entity

data class ScheduleEntity(
    val id: String,
    val studentId: String,
    val dayOfWeek: String, // ex: "Segunda"
    val hour: String // ex: "08h"
)
