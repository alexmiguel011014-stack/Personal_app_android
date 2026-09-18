package com.example.personalapp.data.local.entity

import androidx.room3.Entity
import androidx.room3.PrimaryKey

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
    // GOALS.md §17: trainer-granted, default off, only meaningful for a linked student. Written by
    // the trainer (TrainerRepository.setStudentPermissions/requestAssessment); firestore.rules
    // blocks the student from changing the first two and only lets them *clear* the third, as
    // part of the batch that writes the assessment.
    val canSelfAssess: Boolean = false,
    val canLogBiometrics: Boolean = false,
    val pendingAssessmentRequest: Boolean = false,
)
