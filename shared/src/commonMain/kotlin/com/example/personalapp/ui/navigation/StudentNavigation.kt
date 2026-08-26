package com.example.personalapp.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.savedstate.read
import com.example.personalapp.ui.screen.StudentAssessmentScreen
import com.example.personalapp.ui.screen.StudentEvolutionScreen
import com.example.personalapp.ui.screen.StudentLogSessionScreen
import com.example.personalapp.ui.screen.StudentWorkoutsScreen
import com.example.personalapp.ui.viewmodel.StudentViewModel

sealed class StudentScreen(val route: String) {
    object Workouts : StudentScreen("student_workouts")
    object Evolution : StudentScreen("student_evolution")
    object Assessment : StudentScreen("student_assessment")
    object LogSession : StudentScreen("student_log_session/{workoutId}") {
        fun createRoute(workoutId: String) = "student_log_session/$workoutId"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentNavigation(studentId: String, trainerId: String, onLogout: () -> Unit) {
    val navController = rememberNavController()
    val viewModel: StudentViewModel = koinViewModel()
    LaunchedEffect(studentId, trainerId) { viewModel.start(studentId, trainerId) }
    val profile by viewModel.profile.collectAsState()

    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val isTopLevel = currentRoute == StudentScreen.Workouts.route || currentRoute == StudentScreen.Evolution.route

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
            // GOALS.md §17e: pull-based — no push infrastructure, just a banner the student sees
            // next time they open the app. Hidden on the assessment screen itself so it can't
            // nag while already being answered.
            if (profile?.pendingAssessmentRequest == true && currentRoute != StudentScreen.Assessment.route) {
                Card(
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "Seu personal solicitou uma autoavaliação.",
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(onClick = { navController.navigate(StudentScreen.Assessment.route) }) {
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
                composable(StudentScreen.Assessment.route) {
                    StudentAssessmentScreen(
                        viewModel = viewModel,
                        onSubmitted = { navController.popBackStack() },
                    )
                }
                composable(
                    route = StudentScreen.LogSession.route,
                    arguments = listOf(navArgument("workoutId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val workoutId = backStackEntry.arguments?.read { getStringOrNull("workoutId") } ?: ""
                    StudentLogSessionScreen(
                        workoutId = workoutId,
                        onBack = { navController.popBackStack() },
                        viewModel = viewModel
                    )
                }
            }
        }
    }
}
