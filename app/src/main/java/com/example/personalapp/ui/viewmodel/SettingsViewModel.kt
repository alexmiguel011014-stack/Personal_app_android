package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.SettingsRepository
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class SettingsViewModel(
    private val repository: SettingsRepository
) : ViewModel() {

    val openaiApiKey: StateFlow<String> = repository.openaiApiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val deepseekApiKey: StateFlow<String> = repository.deepseekApiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val claudeApiKey: StateFlow<String> = repository.claudeApiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    fun saveOpenaiApiKey(key: String) {
        viewModelScope.launch {
            repository.saveOpenaiApiKey(key)
        }
    }

    fun saveDeepseekApiKey(key: String) {
        viewModelScope.launch {
            repository.saveDeepseekApiKey(key)
        }
    }

    fun saveClaudeApiKey(key: String) {
        viewModelScope.launch {
            repository.saveClaudeApiKey(key)
        }
    }

    fun saveAllKeys(openai: String, deepseek: String, claude: String) {
        viewModelScope.launch {
            repository.saveOpenaiApiKey(openai)
            repository.saveDeepseekApiKey(deepseek)
            repository.saveClaudeApiKey(claude)
        }
    }
}
