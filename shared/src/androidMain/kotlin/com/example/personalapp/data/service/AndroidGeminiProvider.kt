package com.example.personalapp.data.service

import com.google.firebase.Firebase
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.content
import dev.gitlive.firebase.crashlytics.crashlytics
import dev.gitlive.firebase.Firebase as GitliveFirebase

// Firebase AI Logic (Gemini Developer API backend): no client-side API key — the project's own
// Gemini access is configured once in the Firebase Console (Build → AI Logic) and calls are
// authenticated via App Check, not a key typed into Settings. Free on the Spark plan. Android-only
// today (see GeminiProvider's doc) — com.google.firebase:firebase-ai has no KMP/iOS SDK.
class AndroidGeminiProvider : GeminiProvider {
    companion object {
        // Verify this is still current before relying on it — Google sunsets Gemini model ids on
        // a rolling schedule (e.g. gemini-2.5-flash retires 2026-10-16). Check
        // https://firebase.google.com/docs/ai-logic/models for the current list. Deliberately not
        // "gemini-flash-latest" — that alias points at an experimental build, not the stable one.
        private const val GEMINI_MODEL_ID = "gemini-3.7-flash"
    }

    override suspend fun generate(prompt: String): String {
        val generativeModel = Firebase.ai(backend = GenerativeBackend.googleAI())
            .generativeModel(GEMINI_MODEL_ID)
        return try {
            val response = generativeModel.generateContent(content { text(prompt) })
            response.text ?: "Erro: IA não retornou texto."
        } catch (e: Exception) {
            GitliveFirebase.crashlytics.recordException(e)
            "Erro ao chamar a IA: ${e.message}"
        }
    }
}
