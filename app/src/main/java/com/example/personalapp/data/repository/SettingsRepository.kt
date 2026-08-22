package com.example.personalapp.data.repository

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "settings")

class SettingsRepository(
    private val context: Context
) {
    companion object {
        val OPENAI_API_KEY = stringPreferencesKey("openai_api_key")
        val DEEPSEEK_API_KEY = stringPreferencesKey("deepseek_api_key")
        val CLAUDE_API_KEY = stringPreferencesKey("claude_api_key")
    }

    val openaiApiKey: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[OPENAI_API_KEY] ?: ""
    }

    val deepseekApiKey: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[DEEPSEEK_API_KEY] ?: ""
    }

    val claudeApiKey: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[CLAUDE_API_KEY] ?: ""
    }

    suspend fun saveOpenaiApiKey(key: String) {
        context.dataStore.edit { preferences ->
            preferences[OPENAI_API_KEY] = key
        }
    }

    suspend fun saveDeepseekApiKey(key: String) {
        context.dataStore.edit { preferences ->
            preferences[DEEPSEEK_API_KEY] = key
        }
    }

    suspend fun saveClaudeApiKey(key: String) {
        context.dataStore.edit { preferences ->
            preferences[CLAUDE_API_KEY] = key
        }
    }
}
