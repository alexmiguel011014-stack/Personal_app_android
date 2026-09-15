package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel

/**
 * @param singleColumn GOALS.md §20d: the expanded layout renders this as a ~360dp list pane next
 *   to the details, where the default two-column grid would be unreadably cramped.
 * @param selectedStudentId highlights the row the detail pane is showing (expanded layout only;
 *   null on compact, where selection is a push, not a persistent state).
 */
@Composable
fun StudentsScreen(
    onStudentSelected: (String) -> Unit,
    onNavigateToAddStudent: () -> Unit,
    modifier: Modifier = Modifier,
    singleColumn: Boolean = false,
    selectedStudentId: String? = null,
    viewModel: TrainerViewModel = koinViewModel()
) {
    val students by viewModel.students.collectAsState()

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToAddStudent) {
                Icon(Icons.Default.PersonAdd, contentDescription = "Cadastrar Aluno")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            Text(
                text = "Meus Alunos",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(16.dp)
            )

            if (students.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    Text(text = "Nenhum aluno cadastrado", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(if (singleColumn) 1 else 2),
                    contentPadding = PaddingValues(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(students) { student ->
                        StudentCard(
                            student = student,
                            selected = student.id == selectedStudentId
                        ) { onStudentSelected(student.id) }
                    }
                }
            }
        }
    }
}
