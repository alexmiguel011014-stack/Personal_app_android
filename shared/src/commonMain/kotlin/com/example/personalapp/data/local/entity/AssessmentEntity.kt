package com.example.personalapp.data.local.entity

// GOALS.md §17: a time-series history of self-assessments (PAR-Q + profile snapshot), not a
// single overwritable field — mirrors the existing biometrics/workoutLogs pattern (Firestore
// source of truth + local mirror). submittedAt is always set at creation time here (unlike the
// Firestore doc, which can in principle track a requested-but-unanswered state some other way) —
// this entity only ever represents a *completed* assessment.
data class AssessmentEntity(
    val id: String,
    val studentId: String,
    val trainerId: String,
    val requestedAt: Long,
    val submittedAt: Long,
    val parQAnswers: Map<String, Boolean>,
    val goal: String,
    val experienceLevel: String,
    val trainingDays: List<String>,
) {
    // A "yes" on any PAR-Q question is a health-risk flag the trainer must see, not just log.
    val hasHealthRiskFlag: Boolean get() = parQAnswers.values.any { it }
}
