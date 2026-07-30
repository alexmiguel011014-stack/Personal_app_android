package com.example.personalapp.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "users")
data class UserEntity(
    @PrimaryKey val id: String,
    val name: String,
    val role: String, // 'trainer' or 'student'
    val gender: String = "Masculino", // 'Masculino' or 'Feminino'
    val phone: String = "",
    val goal: String = "",
    val experienceLevel: String = "",
    val medicalNotes: String = "",
    val trainingDays: List<String> = emptyList(),
    val createdAt: Long,
)
