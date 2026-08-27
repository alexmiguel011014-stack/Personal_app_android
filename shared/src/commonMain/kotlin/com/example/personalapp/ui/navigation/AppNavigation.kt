package com.example.personalapp.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.savedstate.read
import com.example.personalapp.ui.screen.*

sealed class Screen(val route: String) {
    object Main : Screen("main")
    object Settings : Screen("settings")
    object AddStudent : Screen("add_student")
    object EditStudent : Screen("edit_student/{studentId}") {
        fun createRoute(studentId: String) = "edit_student/$studentId"
    }
    object StudentDetails : Screen("student_details/{studentId}") {
        fun createRoute(studentId: String) = "student_details/$studentId"
    }
    object WorkoutBuilder : Screen("workout_builder/{studentId}") {
        fun createRoute(studentId: String) = "workout_builder/$studentId"
    }
    object ManualWorkout : Screen("manual_workout/{studentId}") {
        fun createRoute(studentId: String) = "manual_workout/$studentId"
    }
    object EditWorkout : Screen("edit_workout/{studentId}/{workoutId}") {
        fun createRoute(studentId: String, workoutId: String) = "edit_workout/$studentId/$workoutId"
    }
    object AIWorkout : Screen("ai_workout/{studentId}") {
        fun createRoute(studentId: String) = "ai_workout/$studentId"
    }
    object PromptFicha : Screen("prompt_ficha/{studentId}") {
        fun createRoute(studentId: String) = "prompt_ficha/$studentId"
    }
}

@Composable
fun AppNavigation(onLogout: () -> Unit = {}) {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Screen.Main.route
    ) {
        composable(Screen.Main.route) {
            MainScreen(
                onStudentSelected = { studentId ->
                    navController.navigate(Screen.StudentDetails.createRoute(studentId))
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                },
                onNavigateToAddStudent = {
                    navController.navigate(Screen.AddStudent.route)
                },
                onLogout = onLogout
            )
        }
        composable(Screen.Settings.route) {
            SettingsScreen(onBack = { navController.popBackStack() })
        }
        composable(Screen.AddStudent.route) {
            AddStudentScreen(onBack = { navController.popBackStack() })
        }
        composable(
            route = Screen.StudentDetails.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            StudentDetailsScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() },
                onNavigateToManual = { id ->
                    navController.navigate(Screen.ManualWorkout.createRoute(id))
                },
                onNavigateToAI = { id ->
                    navController.navigate(Screen.AIWorkout.createRoute(id))
                },
                onNavigateToPromptFicha = { id ->
                    navController.navigate(Screen.PromptFicha.createRoute(id))
                },
                onNavigateToEdit = { id ->
                    navController.navigate(Screen.EditStudent.createRoute(id))
                },
                onNavigateToWorkoutBuilder = { id ->
                    navController.navigate(Screen.WorkoutBuilder.createRoute(id))
                }
            )
        }
        composable(
            route = Screen.EditStudent.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            EditStudentScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Screen.ManualWorkout.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            ManualWorkoutScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Screen.AIWorkout.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            AIWorkoutScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Screen.WorkoutBuilder.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            WorkoutBuilderScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() },
                onNavigateToManual = { id ->
                    navController.navigate(Screen.ManualWorkout.createRoute(id))
                },
                onNavigateToAI = { id ->
                    navController.navigate(Screen.AIWorkout.createRoute(id))
                },
                onNavigateToPromptFicha = { id ->
                    navController.navigate(Screen.PromptFicha.createRoute(id))
                },
                onNavigateToEditWorkout = { id, workoutId ->
                    navController.navigate(Screen.EditWorkout.createRoute(id, workoutId))
                }
            )
        }
        composable(
            route = Screen.EditWorkout.route,
            arguments = listOf(
                navArgument("studentId") { type = NavType.StringType },
                navArgument("workoutId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            val workoutId = backStackEntry.arguments?.read { getStringOrNull("workoutId") } ?: ""
            ManualWorkoutScreen(
                studentId = studentId,
                workoutId = workoutId,
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            route = Screen.PromptFicha.route,
            arguments = listOf(navArgument("studentId") { type = NavType.StringType })
        ) { backStackEntry ->
            val studentId = backStackEntry.arguments?.read { getStringOrNull("studentId") } ?: ""
            PromptFichaScreen(
                studentId = studentId,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
