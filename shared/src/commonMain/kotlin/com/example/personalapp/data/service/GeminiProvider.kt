package com.example.personalapp.data.service

// GOALS.md §18f: Firebase AI Logic (used for the no-API-key-needed Gemini option) has no official
// Kotlin Multiplatform/iOS SDK — only community bridges exist (e.g. firebase-ai-kmp), each needing
// its own native framework linking, the same class of problem already hit with GitLive's Firebase
// Auth/Firestore (see the iOS CI note on FirebaseCore). Not pursued now: scoped as a known iOS gap
// via this interface rather than a silent omission — the three BYO-key providers (OpenAI/DeepSeek/
// Claude) already work identically on both platforms since they're plain HTTP through Ktor.
interface GeminiProvider {
    suspend fun generate(prompt: String): String
}
