package com.example.personalapp.data.service

import android.content.Context
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.repository.SettingsRepository
import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.content
import com.google.firebase.crashlytics.FirebaseCrashlytics
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

enum class AiProvider { GEMINI, OPENAI, DEEPSEEK, CLAUDE }

@Singleton
class GenerativeAiService @Inject constructor(
    private val settingsRepository: SettingsRepository,
    @ApplicationContext private val context: Context,
) {
    private val json = Json { ignoreUnknownKeys = true }

    companion object {
        // Verify this is still current before relying on it — Google sunsets Gemini model ids on
        // a rolling schedule (e.g. gemini-2.5-flash retires 2026-10-16). Check
        // https://firebase.google.com/docs/ai-logic/models for the current list. Deliberately not
        // "gemini-flash-latest" — that alias points at an experimental build, not the stable one.
        private const val GEMINI_MODEL_ID = "gemini-3.7-flash"

        // DeepSeek's OpenAI-compatible general-purpose alias — verify against
        // https://api-docs.deepseek.com before relying long-term (deepseek-v4-flash/-pro also
        // exist as newer options, see GOALS.md §14b).
        private const val DEEPSEEK_MODEL_ID = "deepseek-chat"
        private const val DEEPSEEK_BASE_URL = "https://api.deepseek.com/chat/completions"

        // Verify against https://docs.anthropic.com/en/docs/about-claude/models before relying
        // long-term — Anthropic model ids also churn.
        private const val CLAUDE_MODEL_ID = "claude-haiku-4-5"
        private const val CLAUDE_BASE_URL = "https://api.anthropic.com/v1/messages"
        // A stable Anthropic API *version* string, unrelated to model version — do not confuse
        // the two, and do not "update" this just because a new model ships.
        private const val ANTHROPIC_VERSION = "2023-06-01"
        private const val CLAUDE_MAX_TOKENS = 4096
    }

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
            AiProvider.DEEPSEEK -> generateWithDeepSeek(fullPrompt)
            AiProvider.CLAUDE -> generateWithClaude(fullPrompt)
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

    // Firebase AI Logic (Gemini Developer API backend): no client-side API key — the project's own
    // Gemini access is configured once in the Firebase Console (Build → AI Logic) and calls are
    // authenticated via App Check, not a key typed into Settings. Free on the Spark plan. Chosen
    // over "trainer brings their own key" because that model needs either a raw client-held key
    // (the security problem this migration fixes) or a Cloud Function proxy (needs the paid Blaze
    // plan) — see GOALS.md §3.
    private suspend fun generateWithGemini(fullPrompt: String): String {
        val generativeModel = Firebase.ai(backend = GenerativeBackend.googleAI())
            .generativeModel(GEMINI_MODEL_ID)
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
        return callOpenAiCompatible("https://api.openai.com/v1/chat/completions", apiKey, "gpt-4o-mini", fullPrompt, "OpenAI")
    }

    // DeepSeek's API is explicitly OpenAI-wire-format-compatible (same request/response shape,
    // same Bearer auth) — reuses the exact same call path as OpenAI, just a different base URL
    // and model id. See GOALS.md §16c.
    private suspend fun generateWithDeepSeek(fullPrompt: String): String {
        val apiKey = settingsRepository.deepseekApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API da DeepSeek não configurada nas configurações."
        return callOpenAiCompatible(DEEPSEEK_BASE_URL, apiKey, DEEPSEEK_MODEL_ID, fullPrompt, "DeepSeek")
    }

    private suspend fun callOpenAiCompatible(url: String, apiKey: String, model: String, fullPrompt: String, providerLabel: String): String {
        return withContext(Dispatchers.IO) {
            try {
                val requestBody = json.encodeToString(
                    OpenAiChatRequest.serializer(),
                    OpenAiChatRequest(
                        model = model,
                        messages = listOf(OpenAiMessage(role = "user", content = fullPrompt)),
                    )
                )
                val connection = (URL(url).openConnection() as HttpURLConnection).apply {
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
                if (responseCode !in 200..299) return@withContext "Erro ao chamar a IA ($providerLabel $responseCode): $responseBody"

                val parsed = json.decodeFromString(OpenAiChatResponse.serializer(), responseBody)
                parsed.choices.firstOrNull()?.message?.content ?: "Erro: IA não retornou texto."
            } catch (e: Exception) {
                FirebaseCrashlytics.getInstance().recordException(e)
                "Erro ao chamar a IA: ${e.message}"
            }
        }
    }

    // Anthropic's Messages API is NOT OpenAI-compatible: x-api-key (not Authorization: Bearer),
    // a required anthropic-version header, and a response shape where "content" is a list of
    // typed blocks rather than a single string. See GOALS.md §16c.
    private suspend fun generateWithClaude(fullPrompt: String): String {
        val apiKey = settingsRepository.claudeApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API da Claude não configurada nas configurações."

        return withContext(Dispatchers.IO) {
            try {
                val requestBody = json.encodeToString(
                    ClaudeMessageRequest.serializer(),
                    ClaudeMessageRequest(
                        model = CLAUDE_MODEL_ID,
                        maxTokens = CLAUDE_MAX_TOKENS,
                        messages = listOf(ClaudeMessage(role = "user", content = fullPrompt)),
                    )
                )
                val connection = (URL(CLAUDE_BASE_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("x-api-key", apiKey)
                    setRequestProperty("anthropic-version", ANTHROPIC_VERSION)
                    connectTimeout = 30_000
                    readTimeout = 30_000
                }
                OutputStreamWriter(connection.outputStream).use { it.write(requestBody) }

                val responseCode = connection.responseCode
                val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
                val responseBody = stream.bufferedReader().use { it.readText() }
                if (responseCode !in 200..299) return@withContext "Erro ao chamar a IA (Claude $responseCode): $responseBody"

                val parsed = json.decodeFromString(ClaudeResponse.serializer(), responseBody)
                parsed.content.firstOrNull { it.type == "text" }?.text ?: "Erro: IA não retornou texto."
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

@Serializable
private data class ClaudeMessageRequest(
    val model: String,
    @SerialName("max_tokens") val maxTokens: Int,
    val messages: List<ClaudeMessage>,
)

@Serializable
private data class ClaudeMessage(val role: String, val content: String)

@Serializable
private data class ClaudeResponse(val content: List<ClaudeContentBlock> = emptyList())

@Serializable
private data class ClaudeContentBlock(val type: String, val text: String = "")
