package com.example.personalapp.data.service

// Known iOS gap (GOALS.md §18f): Firebase AI Logic has a native iOS SDK (FirebaseAI, Swift) but
// no Kotlin Multiplatform wrapper, so reaching it from here needs a hand-written Swift/cinterop
// bridge — deliberately not built yet. Returning a clear message keeps the gap visible in the UI
// rather than crashing or silently doing nothing; the three BYO-key providers work on iOS.
@Suppress("UNUSED_PARAMETER")
internal actual suspend fun generateWithGeminiPlatform(modelId: String, prompt: String): String =
    "Gemini ainda não está disponível no iOS — use OpenAI, DeepSeek ou Claude nas configurações."
