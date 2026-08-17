package com.example.personalapp.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.personalapp.data.repository.AuthRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.data.repository.UserRole
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class Authenticated(val role: UserRole) : AuthState()
    data class Error(val message: String) : AuthState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val repository: AuthRepository,
    private val trainerRepository: TrainerRepository,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState

    init {
        checkCurrentUser()
    }

    private fun checkCurrentUser() {
        val user = repository.getCurrentUser()
        if (user != null) {
            // Se já está logado, precisaríamos buscar o role de novo ou persistir localmente.
            // Para simplificar agora, vamos forçar login ou assumir TRAINER se logado (ideal buscar no repo).
            // Mas para o Router decidir, o Repository deve expor o role atual.
        }
    }

    fun login(email: String, pass: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = repository.login(email, pass)
            result.onSuccess { role ->
                if (role == UserRole.TRAINER) {
                    repository.getCurrentUser()?.uid?.let { trainerRepository.startListening(it) }
                }
                _authState.value = AuthState.Authenticated(role)
            }.onFailure { e ->
                _authState.value = AuthState.Error(e.message ?: "Falha no login")
            }
        }
    }

    fun register(email: String, pass: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            val result = repository.register(email, pass)
            result.onSuccess { role ->
                _authState.value = AuthState.Authenticated(role)
            }.onFailure { e ->
                _authState.value = AuthState.Error(e.message ?: "Falha ao criar conta")
            }
        }
    }

    fun logout() {
        trainerRepository.stopListening()
        repository.logout()
        _authState.value = AuthState.Idle
    }
}
