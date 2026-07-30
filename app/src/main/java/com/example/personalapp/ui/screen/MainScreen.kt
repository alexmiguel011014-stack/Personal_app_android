package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onStudentSelected: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToAddStudent: () -> Unit,
) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Personal APP") },
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Configurações")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.People, contentDescription = "Alunos") },
                    label = { Text("Alunos") },
                    selected = currentRoute == "students",
                    onClick = {
                        if (currentRoute != "students") {
                            navController.navigate("students") {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.CalendarMonth, contentDescription = "Agenda") },
                    label = { Text("Agenda") },
                    selected = currentRoute == "schedule",
                    onClick = {
                        if (currentRoute != "schedule") {
                            navController.navigate("schedule") {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    }
                )
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "students",
            modifier = Modifier.padding(padding)
        ) {
            composable("students") {
                StudentsScreen(
                    onStudentSelected = onStudentSelected,
                    onNavigateToAddStudent = onNavigateToAddStudent
                )
            }
            composable("schedule") {
                ScheduleScreen()
            }
        }
    }
}
