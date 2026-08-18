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
    // true once this student claimed an invite: profile lives in Firestore's users/{uid} (this id
    // IS their Firebase Auth uid), not students/{id}. See GOALS.md §7 "unify".
    val linked: Boolean = false,
)
