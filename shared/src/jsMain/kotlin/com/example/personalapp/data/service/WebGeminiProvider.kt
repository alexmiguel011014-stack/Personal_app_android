package com.example.personalapp.data.service

// See GeminiProvider's doc — Firebase AI Logic (Gemini) is Android-only, same gap already
// documented for iOS (IosGeminiProvider). Honest stub, not a crash or silent gap: the UI
// surfaces this string exactly like any other provider error message.
class WebGeminiProvider : GeminiProvider {
    override suspend fun generate(prompt: String): String =
        "Erro: Gemini ainda não está disponível no navegador — use OpenAI, DeepSeek ou Claude nas configurações."
}
