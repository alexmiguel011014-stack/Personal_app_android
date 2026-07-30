package com.example.personalapp.util

import com.example.personalapp.data.model.Exercise

object WorkoutParser {
    /**
     * Tenta identificar o nome do treino em um texto bruto.
     * Procura por padrões como "Ficha A", "Treino B", "Dia 1".
     */
    fun parseWorkoutName(text: String): String? {
        val lines = text.lines()
        val nameRegex = Regex("""(Ficha|Treino|Dia)\s+([A-Ga-g1-7])""", RegexOption.IGNORE_CASE)
        
        for (line in lines) {
            val match = nameRegex.find(line)
            if (match != null) {
                return match.value.trim()
            }
        }
        return null
    }

    /**
     * Tenta extrair uma lista de exercícios de um texto bruto.
     * Procura por padrões como: "Supino 3x12", "Biceps 12x4", "Agachamento 4 x 10-12".
     */
    fun parseExercises(text: String): List<Exercise> {
        val exercises = mutableListOf<Exercise>()
        val lines = text.lines()
        
        // Regex para capturar padrões de séries e repetições (ex: 3x12, 4 x 10-15)
        // Grupo 1: Números antes do X
        // Grupo 2: Números/Texto após o X
        val workoutPattern = Regex("""(.+?)\s+(\d+)\s*[xX]\s*([\d-]+)""")

        for (line in lines) {
            val trimmedLine = line.trim()
            if (trimmedLine.isBlank()) continue

            val match = workoutPattern.find(trimmedLine)
            if (match != null) {
                val name = match.groupValues[1].trim()
                val partA = match.groupValues[2].trim()
                val partB = match.groupValues[3].trim()

                // Inteligência para decidir quem é série e quem é repetição
                // Normalmente séries são números baixos (1-10) e reps são números maiores (5-30)
                val numA = partA.toIntOrNull() ?: 0
                val numB = partB.toIntOrNull() ?: 0

                val (sets, reps) = if (numA < numB && numA > 0) {
                    // Ex: 3x12 -> 3 séries, 12 reps
                    Pair(numA, partB)
                } else if (numB < numA && numB > 0) {
                    // Ex: 12x4 -> 4 séries, 12 reps (como o exemplo do usuário)
                    Pair(numB, partA)
                } else {
                    // Padrão: Primeiro número é série se for <= 10
                    if (numA <= 10 && numA > 0) Pair(numA, partB) else Pair(numB, partA)
                }

                if (name.isNotEmpty() && sets > 0) {
                    exercises.add(
                        Exercise(
                            name = name,
                            sets = sets,
                            reps = reps,
                            weight = null // Campo de peso em aberto como solicitado
                        )
                    )
                }
            }
        }
        return exercises
    }
}
