package com.example.personalapp.data.service

// See GeminiProvider's doc — no Firebase AI Logic SDK exists for iOS/Kotlin Native without a
// community native-framework bridge, not pursued yet. Honest stub, not a crash or silent gap:
// the UI surfaces this string exactly like any other provider error message.
class IosGeminiProvider : GeminiProvider {
    override suspend fun generate(prompt: String): String =
        "Erro: Gemini ainda não está disponível no iOS — use OpenAI, DeepSeek ou Claude nas configurações."
}
