package com.example.personalapp.data.service

import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.repository.SettingsRepository
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.content
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GenerativeAiService @Inject constructor(
    private val settingsRepository: SettingsRepository
) {
    suspend fun generateWorkout(student: UserEntity, userPrompt: String): String {
        val apiKey = settingsRepository.geminiApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API do Gemini não configurada nas configurações."

        val generativeModel = GenerativeModel(
            modelName = "gemini-1.5-pro",
            apiKey = apiKey
        )

        val fullPrompt = """
            Você é um Personal Trainer especialista. 
            Crie um treino para o seguinte aluno:
            Nome: ${student.name}
            Sexo: ${student.gender}
            Objetivo: ${student.goal}
            Nível: ${student.experienceLevel}
            Notas Médicas/Restrições: ${student.medicalNotes}
            Dias de treino na semana: ${student.trainingDays.joinToString(", ")}
            
            Pedido do Professor: $userPrompt
            
            Retorne a ficha de forma estruturada e profissional. 
            Importante: Retorne a resposta em formato JSON para que eu possa processar, seguindo este exemplo de estrutura:
            {
              "workouts": [
                {
                  "name": "Treino A - Peito e Tríceps",
                  "exercises": [
                    {"name": "Supino Reto", "sets": 3, "reps": "12", "weight": "20kg", "notes": "Controlar a descida"},
                    {"name": "Tríceps Corda", "sets": 3, "reps": "15", "weight": "15kg", "notes": "Cotovelos fechados"}
                  ]
                }
              ]
            }
        """.trimIndent()

        return try {
            val response = generativeModel.generateContent(
                content { text(fullPrompt) }
            )
            response.text ?: "Erro: IA não retornou texto."
        } catch (e: Exception) {
            "Erro ao chamar a IA: ${e.message}"
        }
    }
}
