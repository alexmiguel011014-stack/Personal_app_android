package com.example.personalapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import org.koin.androidx.compose.koinViewModel
import com.example.personalapp.data.repository.UserRole
import com.example.personalapp.ui.screen.AdminDashboardScreen
import com.example.personalapp.ui.screen.LoginScreen
import com.example.personalapp.ui.viewmodel.AuthState
import com.example.personalapp.ui.viewmodel.AuthViewModel

@Composable
fun RoleRouter(
    viewModel: AuthViewModel = koinViewModel()
) {
    val authState by viewModel.authState.collectAsState()
    val authenticated = authState as? AuthState.Authenticated
    val role = authenticated?.role
    val studentUid = authenticated?.let { if (it.role == UserRole.STUDENT) viewModel.currentUid() else null }

    // LoginScreen is called from a single site on purpose: Compose keys @Composable calls by
    // call-site position, so calling LoginScreen() from multiple branches of a when-on-authState
    // (as this used to do) makes Compose tear down and recreate it — including its remembered
    // email/password text field state — on every Idle->Loading->Error/Authenticated transition.
    when {
        role == UserRole.ADM -> AdminDashboardScreen(onLogout = { viewModel.logout() })
        role == UserRole.TRAINER -> AppNavigation(onLogout = { viewModel.logout() }) // O Dashboard original está dentro do AppNavigation
        role == UserRole.STUDENT && studentUid != null && authenticated.trainerId != null ->
            StudentNavigation(studentId = studentUid, trainerId = authenticated.trainerId, onLogout = { viewModel.logout() })
        else -> LoginScreen() // covers Idle/Loading/Error, Authenticated(NONE) and unclaimed STUDENT
    }
}
