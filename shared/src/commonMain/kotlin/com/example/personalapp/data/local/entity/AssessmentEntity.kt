package com.example.personalapp.data.local.entity

import androidx.room3.ColumnInfo
import androidx.room3.Entity
import androidx.room3.PrimaryKey

// GOALS.md §17: one row per submitted self-assessment — a time series, never overwritten, so
// the trainer sees history. Mirrors Firestore's assessments/{id} (written by the student, read by
// the owning trainer). parQAnswers keys are ParQ.QUESTIONS keys; true = "sim" = needs attention.
// goal/experienceLevel/trainingDays are a snapshot of the student's answers at submission time,
// not a live copy of the profile.
@Entity(tableName = "assessments")
data class AssessmentEntity(
    @PrimaryKey val id: String,
    val studentId: String,
    val trainerId: String,
    val submittedAt: Long,
    @ColumnInfo(name = "parQAnswersJson") val parQAnswers: Map<String, Boolean>,
    val goal: String,
    val experienceLevel: String,
    val trainingDays: List<String>,
) {
    // The PAR-Q+ questions the student answered "sim" to — the ones a trainer must look at.
    fun flaggedQuestions(): List<ParQQuestion> = ParQ.QUESTIONS.filter { parQAnswers[it.key] == true }
}

data class ParQQuestion(val key: String, val text: String)

// PAR-Q+ (Physical Activity Readiness Questionnaire), the standard pre-exercise screening set —
// GOALS.md §17a. A "sim" on any question is a flag for the trainer, not a diagnosis.
object ParQ {
    val QUESTIONS: List<ParQQuestion> = listOf(
        ParQQuestion("heart_condition", "Algum médico já disse que você tem um problema cardíaco e que só deve fazer atividade física recomendada por um médico?"),
        ParQQuestion("chest_pain_activity", "Você sente dor no peito quando faz atividade física?"),
        ParQQuestion("chest_pain_rest", "No último mês, você sentiu dor no peito quando não estava fazendo atividade física?"),
        ParQQuestion("dizziness", "Você perde o equilíbrio por tontura ou já perdeu a consciência?"),
        ParQQuestion("bone_joint", "Você tem algum problema ósseo ou articular que pode piorar com a atividade física?"),
        ParQQuestion("medication", "Você toma algum medicamento para pressão arterial ou problema cardíaco?"),
        ParQQuestion("other_reason", "Você conhece alguma outra razão pela qual não deveria fazer atividade física?"),
    )
}
