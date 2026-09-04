package com.example.personalapp.ui.viewmodel

import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.repository.TrainerRepository
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

// Backs PromptFichaScreen (GOALS.md §15): assembles the copy-paste prompt (fixed formatting
// template + the muscle-activation reference table + the student's profile + whatever the
// trainer types) instead of calling any AI API directly — the trainer runs this prompt in
// whichever AI app they already have and pastes the reply back via the existing Smart Paste
// importer, which WorkoutParser (§15c) now understands including the muscle-activation
// annotations this same template asks the AI to produce.
class PromptFichaViewModel(
    private val trainerRepository: TrainerRepository,
    // GOALS.md §18h: the template's $TABLE_PLACEHOLDER$ substitution is pure string work with no
    // dependency on runtime state, so it happens once at DI-wiring time (Android's Koin module,
    // which has the asset-reading Context) instead of needing Context here — same precedent as
    // GenerativeAiService's volumeReference (§18f).
    private val fichaTemplate: String,
) : ViewModel() {

    private val _student = MutableStateFlow<UserEntity?>(null)
    val student: StateFlow<UserEntity?> = _student

    fun loadStudent(studentId: String) {
        viewModelScope.launch {
            _student.value = trainerRepository.getUserById(studentId)
        }
    }

    fun buildPrompt(userRequest: String): String {
        val fullTemplate = fichaTemplate

        val student = _student.value
        val profile = if (student != null) {
            """
            Nome: ${student.name}
            Sexo: ${student.gender}
            Objetivo: ${student.goal}
            Nível: ${student.experienceLevel}
            Notas Médicas/Restrições: ${student.medicalNotes}
            Dias de treino na semana: ${student.trainingDays.joinToString(", ")}
            """.trimIndent()
        } else {
            ""
        }

        return "$fullTemplate$profile\n\nPedido do Professor: $userRequest"
    }

    fun insertWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            trainerRepository.insertWorkout(workout)
        }
    }
}
