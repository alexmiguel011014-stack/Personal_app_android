package com.example.personalapp.data.local.entity

data class UserEntity(
    val id: String,
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
    // GOALS.md §17: trainer-granted, default-off. Only meaningful for a linked student — a draft
    // (students/{id}) has no Firebase Auth account to grant anything to.
    val canSelfAssess: Boolean = false,
    val canLogBiometrics: Boolean = false,
    // Set by the trainer's "Solicitar Autoavaliação" action; cleared by the student's own submit.
    val pendingAssessmentRequest: Boolean = false,
)
