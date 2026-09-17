package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.model.PerformedSet
import com.example.personalapp.ui.viewmodel.StudentViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentLogSessionScreen(
    workoutId: String,
    onBack: () -> Unit,
    viewModel: StudentViewModel,
) {
    val workouts by viewModel.workouts.collectAsState()
    val logSaved by viewModel.logSaved.collectAsState()
    val workout = workouts.firstOrNull { it.id == workoutId }

    // exerciseName -> mutable set rows the student is filling in for this session.
    val setsByExercise = remember(workoutId) {
        mutableStateMapOf<String, SnapshotStateList<Pair<String, String>>>()
    }

    LaunchedEffect(logSaved) {
        if (logSaved) {
            viewModel.resetLogSaved()
            onBack()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(workout?.name ?: "Registrar treino") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        },
        bottomBar = {
            Button(
                onClick = {
                    val entries = setsByExercise.mapValues { (_, rows) ->
                        rows.mapIndexedNotNull { index, (weight, reps) ->
                            val repsInt = reps.toIntOrNull()
                            if (weight.isBlank() || repsInt == null) null
                            else PerformedSet(setNumber = index + 1, weight = weight, reps = repsInt)
                        }
                    }
                    viewModel.logSession(workoutId, entries)
                },
                enabled = setsByExercise.values.any { rows -> rows.any { it.first.isNotBlank() && it.second.toIntOrNull() != null } },
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                Text("Salvar sessão")
            }
        }
    ) { padding ->
        if (workout == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            items(workout.exercises) { exercise ->
                val rows = remember(exercise.name) {
                    setsByExercise.getOrPut(exercise.name) { mutableStateListOf("" to "") }
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text(exercise.name, fontWeight = FontWeight.Bold)
                        Text(
                            "Alvo: ${exercise.sets}x${exercise.reps}" + (exercise.weight?.let { " · $it" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        rows.forEachIndexed { index, (weight, reps) ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Série ${index + 1}", modifier = Modifier.width(72.dp), style = MaterialTheme.typography.bodySmall)
                                OutlinedTextField(
                                    value = weight,
                                    onValueChange = { rows[index] = it to reps },
                                    label = { Text("Peso") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                OutlinedTextField(
                                    value = reps,
                                    onValueChange = { rows[index] = weight to it },
                                    label = { Text("Reps") },
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                        }
                        TextButton(onClick = { rows.add("" to "") }) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Text("Adicionar série")
                        }
                    }
                }
            }
        }
    }
}
