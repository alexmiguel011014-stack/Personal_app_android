package com.example.personalapp.data.local.entity

data class BiometricEntity(
    val id: String,
    val userId: String,
    val weight: Double,
    val height: Double,
    val bodyFat: Double,
    val date: Long
)
