package com.example.personalapp.data.repository

import com.example.personalapp.data.local.SettingsStore
import kotlinx.coroutines.flow.Flow

class SettingsRepository(
    private val store: SettingsStore
) {
    companion object {
        const val OPENAI_API_KEY = "openai_api_key"
        const val DEEPSEEK_API_KEY = "deepseek_api_key"
        const val CLAUDE_API_KEY = "claude_api_key"
        const val STAY_LOGGED_IN = "stay_logged_in"
    }

    // Opt-in "manter conectado?" — defaults to false (discussed with the user 2026-08-26): a
    // fresh install never auto-resumes a session unless the person explicitly asked for it.
    val stayLoggedIn: Flow<Boolean> = store.observeBoolean(STAY_LOGGED_IN)

    suspend fun saveStayLoggedIn(value: Boolean) {
        store.setBoolean(STAY_LOGGED_IN, value)
    }

    val openaiApiKey: Flow<String> = store.observeString(OPENAI_API_KEY)
    val deepseekApiKey: Flow<String> = store.observeString(DEEPSEEK_API_KEY)
    val claudeApiKey: Flow<String> = store.observeString(CLAUDE_API_KEY)

    suspend fun saveOpenaiApiKey(key: String) {
        store.setString(OPENAI_API_KEY, key)
    }

    suspend fun saveDeepseekApiKey(key: String) {
        store.setString(DEEPSEEK_API_KEY, key)
    }

    suspend fun saveClaudeApiKey(key: String) {
        store.setString(CLAUDE_API_KEY, key)
    }
}
