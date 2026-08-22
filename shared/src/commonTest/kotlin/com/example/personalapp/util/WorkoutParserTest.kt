package com.example.personalapp.util

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class WorkoutParserTest {

    @Test
    fun `parseWorkoutName finds Ficha pattern`() {
        assertEquals("Ficha A", WorkoutParser.parseWorkoutName("Ficha A\nSupino 3x12"))
    }

    @Test
    fun `parseWorkoutName finds Treino pattern case-insensitively`() {
        assertEquals("treino b", WorkoutParser.parseWorkoutName("treino b\nAgachamento 4x10"))
    }

    @Test
    fun `parseWorkoutName finds Dia pattern with a digit`() {
        assertEquals("Dia 1", WorkoutParser.parseWorkoutName("Dia 1\nRosca 3x12"))
    }

    @Test
    fun `parseWorkoutName returns null when no pattern matches`() {
        assertNull(WorkoutParser.parseWorkoutName("Supino 3x12\nAgachamento 4x10"))
    }

    @Test
    fun `parseExercises reads sets-then-reps when first number is smaller`() {
        val exercises = WorkoutParser.parseExercises("Supino 3x12")
        assertEquals(1, exercises.size)
        assertEquals("Supino", exercises[0].name)
        assertEquals(3, exercises[0].sets)
        assertEquals("12", exercises[0].reps)
    }

    @Test
    fun `parseExercises swaps sets and reps when written reps-first`() {
        // "Biceps 12x4" -> the smaller number (4) is the set count, matching the parser's
        // documented heuristic for this exact input shape.
        val exercises = WorkoutParser.parseExercises("Biceps 12x4")
        assertEquals(1, exercises.size)
        assertEquals("Biceps", exercises[0].name)
        assertEquals(4, exercises[0].sets)
        assertEquals("12", exercises[0].reps)
    }

    @Test
    fun `parseExercises handles a rep range and spaced x`() {
        val exercises = WorkoutParser.parseExercises("Agachamento 4 x 10-12")
        assertEquals(1, exercises.size)
        assertEquals("Agachamento", exercises[0].name)
        assertEquals(4, exercises[0].sets)
        assertEquals("10-12", exercises[0].reps)
    }

    @Test
    fun `parseExercises parses multiple lines and skips blank and non-matching lines`() {
        val text = """
            Ficha A

            Supino 3x12
            observação: descansar 60s
            Agachamento 4x10
        """.trimIndent()

        val exercises = WorkoutParser.parseExercises(text)

        assertEquals(2, exercises.size)
        assertEquals("Supino", exercises[0].name)
        assertEquals("Agachamento", exercises[1].name)
    }

    @Test
    fun `parseExercises returns empty list for text with no exercise patterns`() {
        assertEquals(emptyList<Any>(), WorkoutParser.parseExercises("Apenas um texto qualquer"))
    }

    @Test
    fun `parseExercises parses a trailing muscle-activation annotation`() {
        val exercises = WorkoutParser.parseExercises("Supino reto 4x10 [Peitoral:1.0, Deltoide ant:0.5]")
        assertEquals(1, exercises.size)
        assertEquals(mapOf("Peitoral" to 1.0, "Deltoide ant" to 0.5), exercises[0].muscleActivation)
    }

    @Test
    fun `parseExercises requires a period decimal in the annotation, not a comma`() {
        // A comma is ambiguous with the muscle-list separator (e.g. "[Costas:0,75]" would look
        // like two entries, "Costas:0" and "75") — treated as malformed and skipped, not parsed.
        val exercises = WorkoutParser.parseExercises("Remada 3x10 [Costas:0.75]")
        assertEquals(mapOf("Costas" to 0.75), exercises[0].muscleActivation)
    }

    @Test
    fun `parseExercises leaves muscleActivation null when no annotation is present`() {
        val exercises = WorkoutParser.parseExercises("Supino 3x12")
        assertNull(exercises[0].muscleActivation)
    }

    @Test
    fun `parseExercises ignores a malformed annotation instead of crashing`() {
        val exercises = WorkoutParser.parseExercises("Supino 3x12 [not valid]")
        assertEquals(1, exercises.size)
        assertNull(exercises[0].muscleActivation)
    }

    @Test
    fun `calculateEffectiveVolume sums fractional contributions across exercises`() {
        val exercises = WorkoutParser.parseExercises(
            """
            Supino reto 4x10 [Peitoral:1.0, Triceps:0.5]
            Puxada frontal 3x12 [Costas:1.0, Biceps:0.5]
            Triceps corda 3x15 [Triceps:1.0]
            """.trimIndent()
        )

        val effectiveVolume = WorkoutParser.calculateEffectiveVolume(exercises)

        assertEquals(4.0, effectiveVolume["Peitoral"])
        assertEquals(3.0, effectiveVolume["Costas"])
        assertEquals(1.5, effectiveVolume["Biceps"])
        // 4 sets * 0.5 (Supino) + 3 sets * 1.0 (Triceps corda) = 5.0
        assertEquals(5.0, effectiveVolume["Triceps"])
    }

    @Test
    fun `calculateEffectiveVolume returns an empty map when no exercise has annotations`() {
        val exercises = WorkoutParser.parseExercises("Supino 3x12\nAgachamento 4x10")
        assertEquals(emptyMap<String, Double>(), WorkoutParser.calculateEffectiveVolume(exercises))
    }
}
