package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val repository: SettingsRepository
) : ViewModel() {

    val geminiApiKey: StateFlow<String> = repository.geminiApiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    val openaiApiKey: StateFlow<String> = repository.openaiApiKey
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "")

    fun saveGeminiApiKey(key: String) {
        viewModelScope.launch {
            repository.saveGeminiApiKey(key)
        }
    }

    fun saveOpenaiApiKey(key: String) {
        viewModelScope.launch {
            repository.saveOpenaiApiKey(key)
        }
    }
}
