package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.model.AIWorkoutResponse
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.service.AiProvider
import com.example.personalapp.data.service.GenerativeAiService
import com.example.personalapp.util.currentTimeMillis
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.crashlytics.crashlytics
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlin.uuid.ExperimentalUuidApi
import kotlin.uuid.Uuid

data class ChatMessage(
    val text: String,
    val isFromUser: Boolean,
    val suggestedWorkouts: List<WorkoutEntity>? = null
)

class AIWorkoutViewModel(
    private val trainerRepository: TrainerRepository,
    private val aiService: GenerativeAiService
) : ViewModel() {

    private val _messages = MutableStateFlow<List<ChatMessage>>(listOf(
        ChatMessage("Olá! Sou sua assistente de treinos. Como posso ajudar a montar a ficha deste aluno hoje?", false)
    ))
    val messages: StateFlow<List<ChatMessage>> = _messages

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating

    private val json = Json { ignoreUnknownKeys = true }

    fun sendMessage(text: String, studentId: String, provider: AiProvider = AiProvider.GEMINI) {
        if (text.isBlank()) return

        viewModelScope.launch {
            _messages.value = _messages.value + ChatMessage(text, true)
            _isGenerating.value = true

            try {
                val student = trainerRepository.getUserById(studentId)
                if (student == null) {
                    _messages.value = _messages.value + ChatMessage("Erro: Aluno não encontrado.", false)
                    return@launch
                }

                val aiRawResponse = aiService.generateWorkout(student, text, provider)
                
                // Try to parse JSON from AI response
                val suggestedWorkouts = tryParseWorkouts(aiRawResponse, studentId)
                
                if (suggestedWorkouts != null) {
                    _messages.value = _messages.value + ChatMessage(
                        text = "Gerei uma sugestão de treino baseada no perfil do aluno. Você pode clicar no card abaixo para revisar e salvar.",
                        isFromUser = false,
                        suggestedWorkouts = suggestedWorkouts
                    )
                } else {
                    Firebase.crashlytics.log("AIWorkoutViewModel: unparsed AI response: $aiRawResponse")
                    _messages.value = _messages.value + ChatMessage(aiRawResponse, false)
                }
            } catch (e: Exception) {
                Firebase.crashlytics.recordException(e)
                _messages.value = _messages.value + ChatMessage("Erro técnico: ${e.message ?: "Falha na comunicação com a IA"}", false)
            } finally {
                _isGenerating.value = false
            }
        }
    }

    @OptIn(ExperimentalUuidApi::class)
    private fun tryParseWorkouts(raw: String, studentId: String): List<WorkoutEntity>? {
        return try {
            // Find JSON block if AI added conversational text
            val jsonStartIndex = raw.indexOf("{")
            val jsonEndIndex = raw.lastIndexOf("}") + 1
            if (jsonStartIndex == -1 || jsonEndIndex <= jsonStartIndex) return null
            
            val jsonStr = raw.substring(jsonStartIndex, jsonEndIndex)
            val parsed = json.decodeFromString<AIWorkoutResponse>(jsonStr)
            
            parsed.workouts.map { aiWorkout ->
                WorkoutEntity(
                    id = Uuid.random().toString(),
                    studentId = studentId,
                    name = aiWorkout.name,
                    isActive = true,
                    exercises = aiWorkout.exercises.map {
                        Exercise(it.name, it.sets, it.reps, it.weight, null, it.notes)
                    },
                    createdAt = currentTimeMillis()
                )
            }
        } catch (e: Exception) {
            null
        }
    }

    fun saveWorkout(workout: WorkoutEntity) {
        viewModelScope.launch {
            trainerRepository.insertWorkout(workout)
            _messages.value = _messages.value + ChatMessage("Treino '${workout.name}' salvo com sucesso!", false)
        }
    }
}
