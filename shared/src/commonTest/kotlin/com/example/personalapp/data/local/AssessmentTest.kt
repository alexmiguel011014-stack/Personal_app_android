package com.example.personalapp.data.local

import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.ParQ
import kotlin.test.Test
import kotlin.test.assertEquals

// GOALS.md §17f — the pure parts: PAR-Q flagging keeps the questionnaire's order and ignores
// unknown keys, and the Room converter for the answers map survives a round trip (it's what both
// Room and the Firestore mapper use to store parQAnswersJson).
class AssessmentTest {

    private fun assessment(answers: Map<String, Boolean>) =
        AssessmentEntity("id", "s", "t", 0L, answers, "", "", emptyList())

    @Test
    fun `flaggedQuestions returns only yes answers, in questionnaire order`() {
        val flagged = assessment(
            mapOf("other_reason" to true, "heart_condition" to true, "dizziness" to false)
        ).flaggedQuestions()
        assertEquals(listOf("heart_condition", "other_reason"), flagged.map { it.key })
    }

    @Test
    fun `flaggedQuestions ignores keys that are not PAR-Q questions`() {
        assertEquals(emptyList(), assessment(mapOf("made_up" to true)).flaggedQuestions())
    }

    @Test
    fun `every PAR-Q key is unique`() {
        assertEquals(ParQ.QUESTIONS.size, ParQ.QUESTIONS.map { it.key }.toSet().size)
    }

    @Test
    fun `boolean map converter round-trips and tolerates garbage`() {
        val converters = Converters()
        val answers = mapOf("heart_condition" to true, "dizziness" to false)
        assertEquals(answers, converters.toBooleanMap(converters.fromBooleanMap(answers)))
        assertEquals(emptyMap(), converters.toBooleanMap("not json"))
    }
}
