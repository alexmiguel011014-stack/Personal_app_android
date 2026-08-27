package com.example.personalapp.data.service

import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.repository.SettingsRepository
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.crashlytics.crashlytics
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.serialization.kotlinx.json.json
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

enum class AiProvider { GEMINI, OPENAI, DEEPSEEK, CLAUDE }

// GOALS.md §18f: OpenAI/DeepSeek/Claude are plain HTTP (via Ktor, replacing the old Android-only
// HttpURLConnection calls) and work identically on both platforms. Gemini goes through
// [GeminiProvider], injected per platform — see that interface's doc for why.
class GenerativeAiService(
    private val settingsRepository: SettingsRepository,
    private val volumeReference: String,
    private val geminiProvider: GeminiProvider,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private val httpClient = HttpClient {
        expectSuccess = false
        install(ContentNegotiation) { json(json) }
        install(HttpTimeout) {
            requestTimeoutMillis = 30_000
            connectTimeoutMillis = 30_000
        }
    }

    companion object {
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

    // Default is OpenAI, not Gemini — GOALS.md §14c: Gemini stays available but isn't the
    // primary/default path until Google's free-tier reliability changes.
    suspend fun generateWorkout(student: UserEntity, userPrompt: String, provider: AiProvider = AiProvider.OPENAI): String {
        val fullPrompt = buildPrompt(student, userPrompt)
        return when (provider) {
            AiProvider.GEMINI -> geminiProvider.generate(fullPrompt)
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
        return try {
            val response = httpClient.post(url) {
                contentType(ContentType.Application.Json)
                header("Authorization", "Bearer $apiKey")
                setBody(OpenAiChatRequest(model = model, messages = listOf(OpenAiMessage(role = "user", content = fullPrompt))))
            }
            if (!response.status.isSuccess()) {
                return "Erro ao chamar a IA ($providerLabel ${response.status.value}): ${response.bodyAsText()}"
            }
            val parsed = response.body<OpenAiChatResponse>()
            parsed.choices.firstOrNull()?.message?.content ?: "Erro: IA não retornou texto."
        } catch (e: Exception) {
            Firebase.crashlytics.recordException(e)
            "Erro ao chamar a IA: ${e.message}"
        }
    }

    // Anthropic's Messages API is NOT OpenAI-compatible: x-api-key (not Authorization: Bearer),
    // a required anthropic-version header, and a response shape where "content" is a list of
    // typed blocks rather than a single string. See GOALS.md §16c.
    private suspend fun generateWithClaude(fullPrompt: String): String {
        val apiKey = settingsRepository.claudeApiKey.first()
        if (apiKey.isBlank()) return "Erro: Chave de API da Claude não configurada nas configurações."

        return try {
            val response = httpClient.post(CLAUDE_BASE_URL) {
                contentType(ContentType.Application.Json)
                header("x-api-key", apiKey)
                header("anthropic-version", ANTHROPIC_VERSION)
                setBody(
                    ClaudeMessageRequest(
                        model = CLAUDE_MODEL_ID,
                        maxTokens = CLAUDE_MAX_TOKENS,
                        messages = listOf(ClaudeMessage(role = "user", content = fullPrompt)),
                    )
                )
            }
            if (!response.status.isSuccess()) {
                return "Erro ao chamar a IA (Claude ${response.status.value}): ${response.bodyAsText()}"
            }
            val parsed = response.body<ClaudeResponse>()
            parsed.content.firstOrNull { it.type == "text" }?.text ?: "Erro: IA não retornou texto."
        } catch (e: Exception) {
            Firebase.crashlytics.recordException(e)
            "Erro ao chamar a IA: ${e.message}"
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
