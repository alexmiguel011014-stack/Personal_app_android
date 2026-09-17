package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.service.PromptAssets
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
    private val promptAssets: PromptAssets,
) : ViewModel() {

    private val _student = MutableStateFlow<UserEntity?>(null)
    val student: StateFlow<UserEntity?> = _student

    // Template with the reference table already spliced in. Loaded once, up front, so
    // buildPrompt() can stay synchronous for the "Copiar Prompt" click (the files are ~10 KB).
    private var fullTemplate: String = ""

    init {
        viewModelScope.launch {
            fullTemplate = promptAssets.fichaPromptTemplate()
                .replace("\$TABLE_PLACEHOLDER\$", promptAssets.volumeReference())
        }
    }

    fun loadStudent(studentId: String) {
        viewModelScope.launch {
            _student.value = trainerRepository.getUserById(studentId)
        }
    }

    fun buildPrompt(userRequest: String): String {
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
