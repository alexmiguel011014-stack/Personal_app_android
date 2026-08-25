package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ToggleOff
import androidx.compose.material.icons.filled.ToggleOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.ui.viewmodel.WorkoutViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutBuilderScreen(
    studentId: String,
    onBack: () -> Unit,
    onNavigateToManual: (String) -> Unit = {},
    onNavigateToAI: (String) -> Unit = {},
    onNavigateToPromptFicha: (String) -> Unit = {},
    viewModel: WorkoutViewModel = koinViewModel(),
) {
    val workouts by viewModel.workouts.collectAsState()

    LaunchedEffect(studentId) {
        viewModel.loadWorkouts(studentId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Construtor de Treinos") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            Text(
                text = "Novo Treino",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = { onNavigateToManual(studentId) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text("Criar Manual")
                }
                Button(
                    onClick = { onNavigateToAI(studentId) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                ) {
                    Text("Criar com IA no App")
                }
                OutlinedButton(
                    onClick = { onNavigateToPromptFicha(studentId) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Criar com Prompt para IA Externa")
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

            Text(
                text = "Treinos Ativos",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            if (workouts.isEmpty()) {
                Text(
                    text = "Nenhum treino encontrado",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(workouts) { workout ->
                        WorkoutCard(
                            workout = workout,
                            onDelete = { viewModel.deleteWorkout(workout) }
                        ) { viewModel.toggleWorkoutStatus(workout) }
                    }
                }
            }
        }
    }
}

@Composable
fun WorkoutCard(
    workout: WorkoutEntity,
    onDelete: () -> Unit,
    onToggleStatus: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = workout.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = if (workout.isActive) "Ativo" else "Inativo",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (workout.isActive) SuccessGreen else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row {
                IconButton(onClick = { /* Editar */ }) {
                    Icon(Icons.Default.Edit, contentDescription = "Editar", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onToggleStatus) {
                    Icon(
                        if (workout.isActive) Icons.Default.ToggleOn else Icons.Default.ToggleOff,
                        contentDescription = "Status",
                        tint = if (workout.isActive) SuccessGreen else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.Delete, contentDescription = "Excluir", tint = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
