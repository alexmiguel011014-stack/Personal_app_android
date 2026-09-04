package com.example.personalapp.data.model

// GOALS.md §17a: the standard 7-question PAR-Q (Physical Activity Readiness Questionnaire) —
// the international pre-exercise health-screening tool used industry-wide, not a bespoke form.
// Keys are stable identifiers (used as AssessmentEntity.parQAnswers' map keys, persisted to
// Firestore) — the Portuguese question text can be edited freely without touching old data,
// but a key must never be renamed/removed once real answers exist under it.
val PAR_Q_QUESTIONS: List<Pair<String, String>> = listOf(
    "heart_condition" to "Algum médico já disse que você possui um problema cardíaco e que só deveria realizar atividade física supervisionada por um médico?",
    "chest_pain_activity" to "Você sente dor no peito quando pratica atividade física?",
    "chest_pain_rest" to "No último mês, você teve dor no peito quando não estava praticando atividade física?",
    "dizziness" to "Você perde o equilíbrio devido a tontura ou já perdeu a consciência alguma vez?",
    "bone_joint" to "Você tem algum problema ósseo ou articular que poderia piorar com uma mudança na sua atividade física?",
    "medication" to "Algum médico está prescrevendo atualmente algum medicamento para pressão arterial ou condição cardíaca?",
    "other_reason" to "Você conhece algum outro motivo pelo qual não deveria praticar atividade física?",
)
