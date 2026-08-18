package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.SettingsRepository
import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import javax.inject.Inject

data class TrainerInfo(val uid: String, val name: String)

enum class ApiStatus { CHECKING, ONLINE, OFFLINE }

// ADM-only cross-trainer data — reads FirebaseFirestore directly instead of going through
// TrainerRepository, which is deliberately scoped to one trainer's own roster (GOALS.md §5e).
@HiltViewModel
class AdminViewModel @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {

    private val _trainerCount = MutableStateFlow<Long?>(null)
    val trainerCount: StateFlow<Long?> = _trainerCount

    private val _totalUserCount = MutableStateFlow<Long?>(null)
    val totalUserCount: StateFlow<Long?> = _totalUserCount

    private val _activeTrainers = MutableStateFlow<List<TrainerInfo>>(emptyList())
    val activeTrainers: StateFlow<List<TrainerInfo>> = _activeTrainers

    private val _firestoreStatus = MutableStateFlow(ApiStatus.CHECKING)
    val firestoreStatus: StateFlow<ApiStatus> = _firestoreStatus

    private val _geminiConfigured = MutableStateFlow(false)
    val geminiConfigured: StateFlow<Boolean> = _geminiConfigured

    private val _openaiConfigured = MutableStateFlow(false)
    val openaiConfigured: StateFlow<Boolean> = _openaiConfigured

    init {
        loadUserStats()
        checkFirestore()
        checkAiKeys()
    }

    private fun loadUserStats() {
        viewModelScope.launch {
            val trainersQuery = firestore.collection("users").whereEqualTo("role", "TRAINER")
            _trainerCount.value = runCatching {
                trainersQuery.count().get(AggregateSource.SERVER).await().count
            }.getOrNull()
            _totalUserCount.value = runCatching {
                firestore.collection("users").count().get(AggregateSource.SERVER).await().count
            }.getOrNull()
            _activeTrainers.value = runCatching {
                trainersQuery.get().await().documents.map { doc ->
                    TrainerInfo(uid = doc.id, name = doc.getString("name") ?: doc.id)
                }
            }.getOrDefault(emptyList())
        }
    }

    private fun checkFirestore() {
        viewModelScope.launch {
            _firestoreStatus.value = try {
                withTimeout(5_000) { firestore.collection("users").limit(1).get().await() }
                ApiStatus.ONLINE
            } catch (e: Exception) {
                ApiStatus.OFFLINE
            }
        }
    }

    // A key here only reflects whether it's configured on THIS device — Gemini/OpenAI keys are
    // per-trainer (§3's "trainer brings their own key"), not a single fleet-wide credential, so
    // there is no meaningful global "is AI online" signal until the §3 Cloud Function proxy exists.
    private fun checkAiKeys() {
        viewModelScope.launch {
            _geminiConfigured.value = settingsRepository.geminiApiKey.first().isNotBlank()
            _openaiConfigured.value = settingsRepository.openaiApiKey.first().isNotBlank()
        }
    }
}
