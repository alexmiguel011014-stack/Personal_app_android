package com.example.personalapp.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.personalapp.ui.screen.StudentAssessmentScreen
import com.example.personalapp.ui.screen.StudentEvolutionScreen
import com.example.personalapp.ui.screen.StudentLogSessionScreen
import com.example.personalapp.ui.screen.StudentWorkoutsScreen
import com.example.personalapp.ui.viewmodel.StudentViewModel

sealed class StudentScreen(val route: String) {
    object Workouts : StudentScreen("student_workouts")
    object Evolution : StudentScreen("student_evolution")
    object LogSession : StudentScreen("student_log_session/{workoutId}") {
        fun createRoute(workoutId: String) = "student_log_session/$workoutId"
    }
    object Assessment : StudentScreen("student_assessment")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentNavigation(studentId: String, trainerId: String, onLogout: () -> Unit) {
    val navController = rememberNavController()
    val viewModel: StudentViewModel = koinViewModel()
    LaunchedEffect(studentId, trainerId) { viewModel.start(studentId, trainerId) }

    val profile by viewModel.profile.collectAsState()
    val actionError by viewModel.actionError.collectAsState()
    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val isTopLevel = currentRoute == StudentScreen.Workouts.route || currentRoute == StudentScreen.Evolution.route

    actionError?.let { message ->
        AlertDialog(
            onDismissRequest = { viewModel.clearActionError() },
            title = { Text("Não foi possível salvar") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { viewModel.clearActionError() }) { Text("OK") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Personal Tracker") },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sair")
                    }
                }
            )
        },
        bottomBar = {
            if (isTopLevel) {
                NavigationBar {
                    NavigationBarItem(
                        selected = currentRoute == StudentScreen.Workouts.route,
                        onClick = { navController.navigate(StudentScreen.Workouts.route) { launchSingleTop = true } },
                        icon = { Icon(Icons.Default.FitnessCenter, contentDescription = null) },
                        label = { Text("Treinos") }
                    )
                    NavigationBarItem(
                        selected = currentRoute == StudentScreen.Evolution.route,
                        onClick = { navController.navigate(StudentScreen.Evolution.route) { launchSingleTop = true } },
                        icon = { Icon(Icons.AutoMirrored.Filled.TrendingUp, contentDescription = null) },
                        label = { Text("Evolução") }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            // GOALS.md §17e: pull-based request — the trainer flipped pendingAssessmentRequest on
            // this profile; the banner is how the student finds out, on whichever tab they open.
            if (profile?.pendingAssessmentRequest == true && isTopLevel) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                ) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Assignment, contentDescription = null)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            "Seu personal pediu uma autoavaliação.",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        TextButton(onClick = { navController.navigate(StudentScreen.Assessment.route) { launchSingleTop = true } }) {
                            Text("Responder")
                        }
                    }
                }
            }
            NavHost(
                navController = navController,
                startDestination = StudentScreen.Workouts.route,
            ) {
            composable(StudentScreen.Workouts.route) {
                StudentWorkoutsScreen(
                    onLogSession = { workoutId -> navController.navigate(StudentScreen.LogSession.createRoute(workoutId)) },
                    viewModel = viewModel
                )
            }
            composable(StudentScreen.Evolution.route) {
                StudentEvolutionScreen(viewModel = viewModel)
            }
            composable(
                route = StudentScreen.LogSession.route,
                arguments = listOf(navArgument("workoutId") { type = NavType.StringType })
            ) { backStackEntry ->
                val workoutId = backStackEntry.arguments?.getString("workoutId") ?: ""
                StudentLogSessionScreen(
                    workoutId = workoutId,
                    onBack = { navController.popBackStack() },
                    viewModel = viewModel
                )
            }
            composable(StudentScreen.Assessment.route) {
                StudentAssessmentScreen(
                    onBack = { navController.popBackStack() },
                    viewModel = viewModel
                )
            }
            }
        }
    }
}
