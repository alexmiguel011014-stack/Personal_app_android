package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController

// GOALS.md §20a: one breakpoint, Material 3's "Expanded" threshold. Below it the UI is exactly
// what it has always been (bottom bar, single pane) — that covers phones, phone browsers and
// portrait tablets alike. At or above it, the same destinations render as a real web dashboard:
// permanent sidebar, and (§20d) the students list and details side by side.
private val ExpandedWidth = 840.dp

// The sidebar carries one destination the bottom bar doesn't: Settings, which on the compact
// layout lives in the app bar's actions instead (GOALS.md §20a).
private data class MainDestination(
    val route: String,
    val label: String,
    val icon: ImageVector,
)

private val MainDestinations = listOf(
    MainDestination("students", "Alunos", Icons.Default.People),
    MainDestination("schedule", "Agenda", Icons.Default.CalendarMonth),
)

/**
 * @param studentDetailPane the details UI for one student, supplied by [AppNavigation] so the six
 *   navigation callbacks `StudentDetailsScreen` needs stay where the rest of the nav graph lives.
 *   Only used by the expanded layout (GOALS.md §20d); the compact layout pushes a route instead.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    onStudentSelected: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToAddStudent: () -> Unit,
    onLogout: () -> Unit = {},
    studentDetailPane: @Composable (studentId: String) -> Unit = {},
) {
    // One nav controller for both layouts: the sidebar and the bottom bar are two renderings of
    // the same selection, not two graphs (GOALS.md §20b) — so the destination survives a resize
    // across the breakpoint.
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    // Expanded layout only: which student the right pane is showing. Survives switching to
    // Agenda and back, and a resize across the breakpoint.
    var selectedStudentId by rememberSaveable { mutableStateOf<String?>(null) }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        if (maxWidth >= ExpandedWidth) {
            ExpandedMainLayout(
                navController = navController,
                currentRoute = currentRoute,
                selectedStudentId = selectedStudentId,
                onStudentSelected = { selectedStudentId = it },
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToAddStudent = onNavigateToAddStudent,
                onLogout = onLogout,
                studentDetailPane = studentDetailPane,
            )
        } else {
            CompactMainLayout(
                navController = navController,
                currentRoute = currentRoute,
                onStudentSelected = onStudentSelected,
                onNavigateToSettings = onNavigateToSettings,
                onNavigateToAddStudent = onNavigateToAddStudent,
                onLogout = onLogout,
            )
        }
    }
}

/** Unchanged phone layout: top app bar with Settings/Logout actions, bottom navigation bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CompactMainLayout(
    navController: NavHostController,
    currentRoute: String?,
    onStudentSelected: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToAddStudent: () -> Unit,
    onLogout: () -> Unit,
) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Personal APP") },
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Configurações")
                    }
                    IconButton(onClick = onLogout) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sair")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                MainDestinations.forEach { destination ->
                    NavigationBarItem(
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                        selected = currentRoute == destination.route,
                        onClick = { navController.navigateToMainDestination(destination.route, currentRoute) }
                    )
                }
            }
        }
    ) { padding ->
        MainNavHost(
            navController = navController,
            onStudentSelected = onStudentSelected,
            onNavigateToAddStudent = onNavigateToAddStudent,
            modifier = Modifier.padding(padding),
        )
    }
}

/**
 * GOALS.md §20b: the dashboard layout — permanent left sidebar plus a persistent top bar, so
 * logout is reachable from every destination without a menu. Settings joins the sidebar here
 * because a two-item rail looks unfinished and there is room for it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExpandedMainLayout(
    navController: NavHostController,
    currentRoute: String?,
    selectedStudentId: String?,
    onStudentSelected: (String) -> Unit,
    onNavigateToSettings: () -> Unit,
    onNavigateToAddStudent: () -> Unit,
    onLogout: () -> Unit,
    studentDetailPane: @Composable (studentId: String) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Personal APP") },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sair")
                    }
                }
            )
        }
    ) { padding ->
        Row(modifier = Modifier.fillMaxSize().padding(padding)) {
            NavigationRail(modifier = Modifier.fillMaxHeight().width(SidebarWidth)) {
                MainDestinations.forEach { destination ->
                    NavigationRailItem(
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label) },
                        selected = currentRoute == destination.route,
                        onClick = { navController.navigateToMainDestination(destination.route, currentRoute) }
                    )
                }
                NavigationRailItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = "Configurações") },
                    label = { Text("Configurações") },
                    // Settings lives outside this inner graph (it's an outer-NavHost push), so it
                    // is never the "selected" rail item — it's an action rendered as one.
                    selected = false,
                    onClick = onNavigateToSettings
                )
            }
            MainNavHost(
                navController = navController,
                onStudentSelected = onStudentSelected,
                onNavigateToAddStudent = onNavigateToAddStudent,
                // GOALS.md §21b/§21c: weight(1f), not fillMaxSize(). Inside a Row, fillMaxSize
                // claims the *full* incoming width instead of what's left after the 240dp rail,
                // so the content pane was laid out 240dp too wide and pushed off the right edge
                // — drawn where nobody can see it, which reads as a frozen screen.
                modifier = Modifier.weight(1f).fillMaxHeight(),
                studentsContent = {
                    // GOALS.md §20d: list and details side by side instead of a push.
                    Row(modifier = Modifier.fillMaxSize()) {
                        StudentsScreen(
                            onStudentSelected = onStudentSelected,
                            onNavigateToAddStudent = onNavigateToAddStudent,
                            singleColumn = true,
                            selectedStudentId = selectedStudentId,
                            modifier = Modifier.width(ListPaneWidth).fillMaxHeight(),
                        )
                        VerticalDivider()
                        // Same fix as above: the detail pane sits next to a fixed 360dp list.
                        Box(modifier = Modifier.weight(1f).fillMaxHeight()) {
                            val studentId = selectedStudentId
                            if (studentId == null) {
                                EmptyDetailPane()
                            } else {
                                studentDetailPane(studentId)
                            }
                        }
                    }
                },
            )
        }
    }
}

private val SidebarWidth = 240.dp
private val ListPaneWidth = 360.dp

/** GOALS.md §20d: what a trainer sees in the right pane before picking anyone. */
@Composable
private fun EmptyDetailPane() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(
            text = "Selecione um aluno",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun MainNavHost(
    navController: NavHostController,
    onStudentSelected: (String) -> Unit,
    onNavigateToAddStudent: () -> Unit,
    modifier: Modifier = Modifier,
    studentsContent: (@Composable () -> Unit)? = null,
) {
    NavHost(
        navController = navController,
        startDestination = "students",
        modifier = modifier
    ) {
        composable("students") {
            if (studentsContent != null) {
                studentsContent()
            } else {
                StudentsScreen(
                    onStudentSelected = onStudentSelected,
                    onNavigateToAddStudent = onNavigateToAddStudent,
                )
            }
        }
        composable("schedule") {
            ScheduleScreen()
        }
    }
}

private fun NavHostController.navigateToMainDestination(route: String, currentRoute: String?) {
    if (currentRoute == route) return
    navigate(route) {
        popUpTo(graph.startDestinationId) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
