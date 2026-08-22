package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.SettingsRepository
import com.google.firebase.firestore.AggregateSource
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout

data class TrainerInfo(val uid: String, val name: String)
data class TrainerRequest(val uid: String, val email: String)

enum class ApiStatus { CHECKING, ONLINE, OFFLINE }

/**
 * ADM-only cross-trainer data — reads [FirebaseFirestore] directly instead of going through
 * [com.example.personalapp.data.repository.TrainerRepository], which is deliberately scoped to
 * one trainer's own roster (GOALS.md §5e).
 */
class AdminViewModel(
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

    private val _openaiConfigured = MutableStateFlow(false)
    val openaiConfigured: StateFlow<Boolean> = _openaiConfigured

    private val _promoteResult = MutableStateFlow<String?>(null)
    val promoteResult: StateFlow<String?> = _promoteResult

    private val _promoteError = MutableStateFlow<String?>(null)
    val promoteError: StateFlow<String?> = _promoteError

    private val _pendingTrainerRequests = MutableStateFlow<List<TrainerRequest>>(emptyList())
    val pendingTrainerRequests: StateFlow<List<TrainerRequest>> = _pendingTrainerRequests

    init {
        loadUserStats()
        checkFirestore()
        checkAiKeys()
        loadTrainerRequests()
    }

    fun loadUserStats() {
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

    // OpenAI keys are per-trainer (opt-in alternative to Gemini, which needs no key — see
    // GOALS.md §3), so this only reflects whether it's configured on THIS device, not fleet-wide.
    private fun checkAiKeys() {
        viewModelScope.launch {
            _openaiConfigured.value = settingsRepository.openaiApiKey.first().isNotBlank()
        }
    }

    // Promotes an existing user (who already self-registered, so a users/{uid} Auth account
    // exists) to TRAINER. Self-registration always yields role=STUDENT — only an ADM can grant
    // TRAINER, and firestore.rules enforces that (isAdmin() is the only bypass of the "can't
    // change your own role" rule) — see GOALS.md §7. Manual fallback for a UID not (or no longer)
    // in the trainerRequests queue below, which is the normal path.
    fun promoteToTrainer(uid: String, name: String) {
        val trimmedUid = uid.trim()
        if (trimmedUid.isBlank()) {
            _promoteError.value = "Informe o UID do usuário."
            return
        }
        viewModelScope.launch {
            try {
                firestore.collection("users").document(trimmedUid).set(
                    mapOf("role" to "TRAINER", "name" to name.trim().ifBlank { trimmedUid }),
                    SetOptions.merge()
                ).await()
                _promoteResult.value = "Usuário promovido a Trainer."
                loadUserStats()
            } catch (e: Exception) {
                _promoteError.value = e.message ?: "Falha ao promover usuário."
            }
        }
    }

    fun clearPromoteResult() {
        _promoteResult.value = null
        _promoteError.value = null
    }

    // trainerRequests/{uid} is a self-service "please make me a Trainer" mailbox a STUDENT writes
    // to themselves (LoginScreen's "Solicitar acesso de Trainer") — see GOALS.md §5e. Listing it
    // is ADM-only per firestore.rules; accepting reuses the same isAdmin() write as
    // promoteToTrainer, then clears the request so it drops off this list.
    fun loadTrainerRequests() {
        viewModelScope.launch {
            _pendingTrainerRequests.value = runCatching {
                firestore.collection("trainerRequests").get().await().documents.map { doc ->
                    TrainerRequest(uid = doc.id, email = doc.getString("email") ?: doc.id)
                }
            }.getOrDefault(emptyList())
        }
    }

    fun acceptTrainerRequest(request: TrainerRequest) {
        viewModelScope.launch {
            try {
                firestore.collection("users").document(request.uid).set(
                    mapOf("role" to "TRAINER", "name" to request.email.substringBefore("@")),
                    SetOptions.merge()
                ).await()
                firestore.collection("trainerRequests").document(request.uid).delete().await()
                _promoteResult.value = "${request.email} promovido a Trainer."
                loadUserStats()
                loadTrainerRequests()
            } catch (e: Exception) {
                _promoteError.value = e.message ?: "Falha ao aprovar solicitação."
            }
        }
    }

    fun rejectTrainerRequest(request: TrainerRequest) {
        viewModelScope.launch {
            try {
                firestore.collection("trainerRequests").document(request.uid).delete().await()
                loadTrainerRequests()
            } catch (e: Exception) {
                _promoteError.value = e.message ?: "Falha ao recusar solicitação."
            }
        }
    }
}
