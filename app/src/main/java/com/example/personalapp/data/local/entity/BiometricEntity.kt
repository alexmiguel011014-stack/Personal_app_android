package com.example.personalapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "biometrics")
data class BiometricEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val weight: Double,
    val height: Double,
    val bodyFat: Double,
    val date: Long
)
