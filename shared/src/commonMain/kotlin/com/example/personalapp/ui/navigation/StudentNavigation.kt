package com.example.personalapp.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import org.koin.compose.viewmodel.koinViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.savedstate.read
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
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentNavigation(studentId: String, trainerId: String, onLogout: () -> Unit) {
    val navController = rememberNavController()
    val viewModel: StudentViewModel = koinViewModel()
    LaunchedEffect(studentId, trainerId) { viewModel.start(studentId, trainerId) }

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
        NavHost(
            navController = navController,
            startDestination = StudentScreen.Workouts.route,
            modifier = Modifier.padding(padding)
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
