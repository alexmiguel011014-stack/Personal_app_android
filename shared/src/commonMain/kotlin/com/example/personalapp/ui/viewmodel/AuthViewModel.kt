package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.SettingsRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.repository.UserRole
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    // trainerId is only ever non-null for a STUDENT who has already claimed an invite (§7).
    data class Authenticated(val role: UserRole, val trainerId: String?) : AuthState()
    data class Error(val message: String) : AuthState()
}

sealed class InviteClaimState {
    object Idle : InviteClaimState()
    object Loading : InviteClaimState()
    object Success : InviteClaimState()
    data class Error(val message: String) : InviteClaimState()
}

sealed class PasswordResetState {
    object Idle : PasswordResetState()
    object Loading : PasswordResetState()
    object Sent : PasswordResetState()
    data class Error(val message: String) : PasswordResetState()
}

sealed class TrainerRequestState {
    object Idle : TrainerRequestState()
    object Loading : TrainerRequestState()
    object Sent : TrainerRequestState()
    data class Error(val message: String) : TrainerRequestState()
}

class AuthViewModel(
    private val repository: AuthRepository,
    private val trainerRepository: TrainerRepository,
    private val settingsRepository: SettingsRepository,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState

    private val _inviteClaimState = MutableStateFlow<InviteClaimState>(InviteClaimState.Idle)
    val inviteClaimState: StateFlow<InviteClaimState> = _inviteClaimState

    private val _passwordResetState = MutableStateFlow<PasswordResetState>(PasswordResetState.Idle)
    val passwordResetState: StateFlow<PasswordResetState> = _passwordResetState

    private val _trainerRequestState = MutableStateFlow<TrainerRequestState>(TrainerRequestState.Idle)
    val trainerRequestState: StateFlow<TrainerRequestState> = _trainerRequestState

    // "Manter conectado?" checkbox on LoginScreen — persisted via DataStore, defaults to false
    // (discussed with the user 2026-08-26): a fresh install never auto-resumes a session unless
    // asked to.
    val stayLoggedIn: StateFlow<Boolean> = settingsRepository.stayLoggedIn
        .stateIn(viewModelScope, SharingStarted.Eagerly, false)

    fun setStayLoggedIn(value: Boolean) {
        viewModelScope.launch { settingsRepository.saveStayLoggedIn(value) }
    }

    init {
        viewModelScope.launch { checkCurrentUser() }
    }

    // Firebase itself persists its own session across app restarts regardless of this app's
    // "manter conectado" preference — that preference controls whether THIS app *acts* on it.
    // If not, sign out for real so the two don't silently disagree (discussed with the user).
    private suspend fun checkCurrentUser() {
        val user = repository.getCurrentUser() ?: return
        if (settingsRepository.stayLoggedIn.first()) {
            repository.resolveCurrentSession().onSuccess { auth ->
                if (auth.role == UserRole.TRAINER) {
                    trainerRepository.startListening(user.uid)
                }
                _authState.value = AuthState.Authenticated(auth.role, auth.trainerId)
            }
            // On failure (e.g. offline, Firestore unreachable) stay Idle -> LoginScreen rather
            // than forcing a sign-out over a transient error.
        } else {
            repository.logout()
        }
    }

    fun login(email: String, pass: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = repository.login(email, pass)
            result.onSuccess { auth ->
                if (auth.role == UserRole.TRAINER) {
                    repository.getCurrentUser()?.uid?.let { trainerRepository.startListening(it) }
                }
                _authState.value = AuthState.Authenticated(auth.role, auth.trainerId)
            }.onFailure { e ->
                _authState.value = AuthState.Error(e.message ?: "Falha no login")
            }
        }
    }

    fun register(email: String, pass: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = repository.register(email, pass)
            result.onSuccess { auth ->
                _authState.value = AuthState.Authenticated(auth.role, auth.trainerId)
            }.onFailure { e ->
                _authState.value = AuthState.Error(e.message ?: "Falha ao criar conta")
            }
        }
    }

    fun claimInvite(code: String) {
        viewModelScope.launch {
            _inviteClaimState.value = InviteClaimState.Loading
            repository.claimInvite(code).onSuccess { trainerId ->
                _inviteClaimState.value = InviteClaimState.Success
                val current = _authState.value
                if (current is AuthState.Authenticated) {
                    _authState.value = current.copy(trainerId = trainerId)
                }
            }.onFailure { e ->
                _inviteClaimState.value = InviteClaimState.Error(e.message ?: "Código inválido")
            }
        }
    }

    fun resetPassword(email: String) {
        viewModelScope.launch {
            _passwordResetState.value = PasswordResetState.Loading
            repository.resetPassword(email).onSuccess {
                _passwordResetState.value = PasswordResetState.Sent
            }.onFailure { e ->
                _passwordResetState.value = PasswordResetState.Error(e.message ?: "Falha ao enviar e-mail")
            }
        }
    }

    fun requestTrainerAccess() {
        viewModelScope.launch {
            _trainerRequestState.value = TrainerRequestState.Loading
            repository.requestTrainerAccess().onSuccess {
                _trainerRequestState.value = TrainerRequestState.Sent
            }.onFailure { e ->
                _trainerRequestState.value = TrainerRequestState.Error(e.message ?: "Falha ao enviar solicitação")
            }
        }
    }

    fun currentUid(): String? = repository.getCurrentUser()?.uid

    fun logout() {
        trainerRepository.stopListening()
        viewModelScope.launch {
            repository.logout()
            _authState.value = AuthState.Idle
        }
    }
}
