package com.example.personalapp.ui.screen

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.ui.viewmodel.StudentViewModel

@Composable
fun StudentWorkoutsScreen(
    onLogSession: (String) -> Unit,
    viewModel: StudentViewModel,
) {
    val workouts by viewModel.workouts.collectAsState()

    if (workouts.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                "Nenhuma ficha atribuída ainda. Fale com seu personal.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(24.dp)
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(workouts) { workout ->
            WorkoutCard(workout = workout, onLogSession = { onLogSession(workout.id) })
        }
    }
}

@Composable
private fun WorkoutCard(workout: WorkoutEntity, onLogSession: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth().animateContentSize()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(workout.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text(
                        "${workout.exercises.size} exercícios",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null
                )
            }

            if (expanded) {
                Spacer(modifier = Modifier.height(12.dp))
                workout.exercises.forEach { exercise ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(exercise.name, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "${exercise.sets}x${exercise.reps}" + (exercise.weight?.let { " · $it" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onLogSession, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.FitnessCenter, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Registrar treino de hoje")
                }
            }
        }
    }
}
