package com.example.personalapp.data.service

import android.content.Context
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.repository.SettingsRepository
import com.google.ai.client.generativeai.GenerativeModel
import com.google.ai.client.generativeai.type.content
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

enum class AiProvider { GEMINI, OPENAI }

@Singleton
class GenerativeAiService @Inject constructor(
    private val settingsRepository: SettingsRepository,
    @ApplicationContext private val context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true }

    // Read once per process (this service is @Singleton) instead of on every generateWorkout()
    // call — see GOALS.md §5d for why this is embedded as text instead of sent as a raw PDF.
    private val volumeReference: String by lazy {
        context.assets.open("hypertrophy_volume_reference.md").bufferedReader().use { it.readText() }
    }

    suspend fun generateWorkout(student: UserEntity, userPrompt: String, provider: AiProvider = AiProvider.GEMINI): String {
        val fullPrompt = buildPrompt(student, userPrompt)
        return when (provider) {
            AiProvider.GEMINI -> generateWithGemini(fullPrompt)
            AiProvider.OPENAI -> generateWithOpenAi(fullPrompt)
        }
    }

    private fun buildPrompt(student: UserEntity, userPrompt: String) = """
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

        Use a tabela de referência abaixo para balancear o volume semanal por grupo muscular ao
        escolher e distribuir os exercícios da ficha. Cada valor indica quanto uma série "dura"
        daquele exercício conta como volume efetivo de hipertrofia para aquele músculo (0 a 1,0;
        ver a régua de pontuação). Priorize cobrir os grupos musculares relevantes ao objetivo do
        aluno sem concentrar volume demais em poucos músculos.

        $volumeReference
    """.trimIndent()

    private suspend fun generateWithGemini(fullPrompt: String): String {
        val apiKey = settingsRepository.geminiApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API do Gemini não configurada nas configurações."

        val generativeModel = GenerativeModel(modelName = "gemini-1.5-pro", apiKey = apiKey)
        return try {
            val response = generativeModel.generateContent(content { text(fullPrompt) })
            response.text ?: "Erro: IA não retornou texto."
        } catch (e: Exception) {
            FirebaseCrashlytics.getInstance().recordException(e)
            "Erro ao chamar a IA: ${e.message}"
        }
    }

    private suspend fun generateWithOpenAi(fullPrompt: String): String {
        val apiKey = settingsRepository.openaiApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API da OpenAI não configurada nas configurações."

        return withContext(Dispatchers.IO) {
            try {
                val requestBody = json.encodeToString(
                    OpenAiChatRequest.serializer(),
                    OpenAiChatRequest(
                        model = "gpt-4o-mini",
                        messages = listOf(OpenAiMessage(role = "user", content = fullPrompt)),
                    )
                )
                val connection = (URL("https://api.openai.com/v1/chat/completions").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer $apiKey")
                    connectTimeout = 30_000
                    readTimeout = 30_000
                }
                OutputStreamWriter(connection.outputStream).use { it.write(requestBody) }

                val responseCode = connection.responseCode
                val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                val responseBody = stream.bufferedReader().use { it.readText() }
                if (responseCode !in 200..299) return@withContext "Erro ao chamar a IA (OpenAI $responseCode): $responseBody"

                val parsed = json.decodeFromString(OpenAiChatResponse.serializer(), responseBody)
                parsed.choices.firstOrNull()?.message?.content ?: "Erro: IA não retornou texto."
            } catch (e: Exception) {
                FirebaseCrashlytics.getInstance().recordException(e)
                "Erro ao chamar a IA: ${e.message}"
            }
        }
    }
}

@Serializable
private data class OpenAiChatRequest(val model: String, val messages: List<OpenAiMessage>)

@Serializable
private data class OpenAiMessage(val role: String, val content: String)

@Serializable
private data class OpenAiChatResponse(val choices: List<OpenAiChoice> = emptyList())

@Serializable
private data class OpenAiChoice(val message: OpenAiMessage)
