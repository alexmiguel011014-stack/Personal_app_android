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
    val role = (authState as? AuthState.Authenticated)?.role

    // LoginScreen is called from a single site on purpose: Compose keys @Composable calls by
    // call-site position, so calling LoginScreen() from multiple branches of a when-on-authState
    // (as this used to do) makes Compose tear down and recreate it — including its remembered
    // email/password text field state — on every Idle->Loading->Error/Authenticated transition.
    when (role) {
        UserRole.ADM -> AdminDashboardScreen(onLogout = { viewModel.logout() })
        UserRole.TRAINER -> AppNavigation() // O Dashboard original está dentro do AppNavigation
        else -> LoginScreen() // covers Idle/Loading/Error and Authenticated(STUDENT/NONE)
    }
}
