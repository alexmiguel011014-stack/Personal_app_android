package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel

/**
 * @param singleColumn GOALS.md §20d/§22c: true only inside the expanded layout's ~360dp list
 *   pane — reused here as the "desktop density" signal (tighter padding) as well, since it is
 *   already exactly the compact/expanded split §20 uses everywhere else in this screen tree.
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
    // GOALS.md §22c: tighter padding on the desktop pane; unchanged (16dp, full touch targets)
    // on the compact/phone layout, gated the same way §20's own layouts are.
    val horizontalPadding = if (singleColumn) 12.dp else 16.dp
    val verticalPadding = if (singleColumn) 8.dp else 16.dp

    Column(modifier = modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = horizontalPadding, vertical = verticalPadding),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "Meus Alunos", style = MaterialTheme.typography.headlineSmall)
            // GOALS.md §22c: an ordinary labelled button, not a circular FloatingActionButton —
            // the single most recognisable Android-app signal this screen had.
            Button(onClick = onNavigateToAddStudent) {
                Icon(Icons.Default.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (singleColumn) "Novo" else "Cadastrar Aluno")
            }
        }
        HorizontalDivider()

        if (students.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = "Nenhum aluno cadastrado", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            // GOALS.md §22c: a dense single-column list of rows instead of a 2-column grid of
            // 100dp square cards — shows meaningfully more students without scrolling, on both
            // the compact and expanded layouts (the old grid only ever differed by column count,
            // which was never the actual "app" signal; the tall square cards were).
            LazyColumn {
                items(students) { student ->
                    StudentListItem(
                        student = student,
                        selected = student.id == selectedStudentId,
                        dense = singleColumn,
                        onClick = { onStudentSelected(student.id) },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}
