package com.example.personalapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.data.repository.UserRole
import com.example.personalapp.ui.screen.AdminDashboardScreen
import com.example.personalapp.ui.screen.LoginScreen
import com.example.personalapp.ui.viewmodel.AuthState
import com.example.personalapp.ui.viewmodel.AuthViewModel

@Composable
fun RoleRouter(
    viewModel: AuthViewModel = hiltViewModel()
) {
    val authState by viewModel.authState.collectAsState()

    when (authState) {
        is AuthState.Authenticated -> {
            val role = (authState as AuthState.Authenticated).role
            when (role) {
                UserRole.ADM -> AdminDashboardScreen(onLogout = { viewModel.logout() })
                UserRole.TRAINER -> AppNavigation() // O Dashboard original está dentro do AppNavigation
                UserRole.STUDENT -> LoginScreen() // Mostra o aviso que já existe no LoginScreen para Alunos
                else -> LoginScreen()
            }
        }
        is AuthState.Loading -> {
            // Splash ou Loading
            LoginScreen() // Simplificado
        }
        else -> {
            LoginScreen()
        }
    }
}
