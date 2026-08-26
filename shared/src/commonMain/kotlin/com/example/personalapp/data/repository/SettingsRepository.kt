package com.example.personalapp.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SettingsRepository(
    private val dataStore: DataStore<Preferences>
) {
    companion object {
        val OPENAI_API_KEY = stringPreferencesKey("openai_api_key")
        val DEEPSEEK_API_KEY = stringPreferencesKey("deepseek_api_key")
        val CLAUDE_API_KEY = stringPreferencesKey("claude_api_key")
        val STAY_LOGGED_IN = booleanPreferencesKey("stay_logged_in")
    }

    // Opt-in "manter conectado?" — defaults to false (discussed with the user 2026-08-26): a
    // fresh install never auto-resumes a session unless the person explicitly asked for it.
    val stayLoggedIn: Flow<Boolean> = dataStore.data.map { preferences ->
        preferences[STAY_LOGGED_IN] ?: false
    }

    suspend fun saveStayLoggedIn(value: Boolean) {
        dataStore.edit { preferences ->
            preferences[STAY_LOGGED_IN] = value
        }
    }

    val openaiApiKey: Flow<String> = dataStore.data.map { preferences ->
        preferences[OPENAI_API_KEY] ?: ""
    }

    val deepseekApiKey: Flow<String> = dataStore.data.map { preferences ->
        preferences[DEEPSEEK_API_KEY] ?: ""
    }

    val claudeApiKey: Flow<String> = dataStore.data.map { preferences ->
        preferences[CLAUDE_API_KEY] ?: ""
    }

    suspend fun saveOpenaiApiKey(key: String) {
        dataStore.edit { preferences ->
            preferences[OPENAI_API_KEY] = key
        }
    }

    suspend fun saveDeepseekApiKey(key: String) {
        dataStore.edit { preferences ->
            preferences[DEEPSEEK_API_KEY] = key
        }
    }

    suspend fun saveClaudeApiKey(key: String) {
        dataStore.edit { preferences ->
            preferences[CLAUDE_API_KEY] = key
        }
    }
}
