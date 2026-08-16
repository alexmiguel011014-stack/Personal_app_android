package com.example.personalapp.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

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
}
