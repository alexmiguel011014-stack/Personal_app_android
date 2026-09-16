package com.example.personalapp.data.service

import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.content

internal actual suspend fun generateWithGeminiPlatform(modelId: String, prompt: String): String {
    val generativeModel = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(modelId)
    val response = generativeModel.generateContent(content { text(prompt) })
    return response.text ?: "Erro: IA não retornou texto."
}
