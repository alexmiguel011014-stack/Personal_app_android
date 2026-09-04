package com.example.personalapp.util

import com.example.personalapp.data.model.Exercise

/**
 * Parses free-text pasted from external sources (e.g. a WhatsApp message from a trainer) into a
 * workout name and exercise list — see "Smart Paste" in CLAUDE.md.
 *
 * The sets-vs-reps heuristic in [parseExercises] is deliberate, not a bug: given two numbers
 * around an "x"/"X", it picks the *smaller* one as the set count, regardless of which side of the
 * "x" it appears on. This lets both "Supino 3x12" (sets-first) and "Biceps 12x4" (reps-first —
 * exactly the shape a trainer might paste) resolve to the same meaning. Do not replace this with
 * a fixed "first number = sets" rule; see [com.example.personalapp.util.WorkoutParserTest] for
 * the exact cases this covers.
 */
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

    // Optional trailing per-exercise muscle-activation annotation, e.g.
    // "Supino reto 4x10 [Peitoral:1.0, Delt.ant:0.5]" — produced by the §15 prompt-template
    // format when the pasted text came from an AI following it, ignored (not an error) when
    // absent, same "messy pasted text is expected" convention as every other unmatched line.
    // See GOALS.md §15c.
    private val muscleAnnotationRegex = Regex("""\[([^]]+)]""")

    // Coefficients must use a period, not a comma — the muscle list itself is comma-separated
    // (e.g. "[Peitoral:1.0, Tríceps:0.5]"), so a comma decimal ("0,5") would be ambiguous with
    // the next muscle entry. The prompt template (ficha_prompt_template.md) instructs the AI
    // accordingly; a comma-decimal here is treated as a malformed entry and skipped, same as any
    // other unparseable line — not a crash.
    private fun parseMuscleActivation(line: String): Map<String, Double>? {
        val match = muscleAnnotationRegex.find(line) ?: return null
        val pairs = match.groupValues[1].split(",").mapNotNull { part ->
            val kv = part.split(":")
            if (kv.size != 2) return@mapNotNull null
            val muscle = kv[0].trim()
            val coefficient = kv[1].trim().toDoubleOrNull() ?: return@mapNotNull null
            if (muscle.isEmpty()) null else muscle to coefficient
        }.toMap()
        return pairs.ifEmpty { null }
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
                            weight = null, // Campo de peso em aberto como solicitado
                            muscleActivation = parseMuscleActivation(trimmedLine)
                        )
                    )
                }
            }
        }
        return exercises
    }

    /**
     * Effective weekly volume per muscle: Σ(sets × activation coefficient) across every
     * exercise that annotates that muscle. Validated method, not an invented heuristic — see
     * REPERTOIRE.md §1 (2025 dose-response meta-regression, DOI 10.1007/s40279-025-02344-w):
     * fractional counting of indirect/secondary sets showed the strongest evidence of any
     * counting method tested. Exercises with no [Muscle:coef] annotation contribute nothing
     * (not an error — plain Smart Paste text, today's existing use case, has none).
     */
    fun calculateEffectiveVolume(exercises: List<Exercise>): Map<String, Double> {
        val totals = mutableMapOf<String, Double>()
        for (exercise in exercises) {
            exercise.muscleActivation?.forEach { (muscle, coefficient) ->
                totals[muscle] = (totals[muscle] ?: 0.0) + exercise.sets * coefficient
            }
        }
        return totals
    }
}
