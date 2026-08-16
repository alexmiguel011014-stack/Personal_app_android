package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import com.example.personalapp.util.WorkoutParser
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualWorkoutScreen(
    studentId: String,
    onBack: () -> Unit,
    viewModel: WorkoutViewModel = hiltViewModel()
) {
    var workoutName by remember { mutableStateOf("") }
    val exercises = remember { mutableStateListOf<Exercise>() }
    var showAddExerciseDialog by remember { mutableStateOf(false) }
    var showValidation by remember { mutableStateOf(false) }
    val nameError = showValidation && workoutName.isBlank()
    val exercisesError = showValidation && exercises.isEmpty()

    // Smart Paste state
    var rawText by remember { mutableStateOf("") }
    var isSmartPasteExpanded by remember { mutableStateOf(false) }

    if (showAddExerciseDialog) {
        AddExerciseDialog(
            onDismiss = { showAddExerciseDialog = false },
            onAdd = { exercises.add(it) }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Novo Treino") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    showValidation = true
                    if (workoutName.isNotBlank() && exercises.isNotEmpty()) {
                        val workout = WorkoutEntity(
                            id = UUID.randomUUID().toString(),
                            studentId = studentId,
                            name = workoutName,
                            isActive = true,
                            exercises = exercises.toList(),
                            createdAt = System.currentTimeMillis()
                        )
                        viewModel.insertWorkout(workout)
                        onBack()
                    }
                },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text("Salvar Ficha") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            OutlinedTextField(
                value = workoutName,
                onValueChange = { workoutName = it },
                label = { Text("Nome do Treino (ex: Treino A)") },
                modifier = Modifier.fillMaxWidth(),
                isError = nameError,
                supportingText = { if (nameError) Text("Nome do treino é obrigatório") }
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Smart Paste Section
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Importador Inteligente", style = MaterialTheme.typography.titleSmall)
                        }
                        TextButton(onClick = { isSmartPasteExpanded = !isSmartPasteExpanded }) {
                            Text(if (isSmartPasteExpanded) "Fechar" else "Abrir")
                        }
                    }

                    if (isSmartPasteExpanded) {
                        Text(
                            "Cole o texto (ex: Biceps 12x4) abaixo para identificar os exercícios automaticamente.",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        OutlinedTextField(
                            value = rawText,
                            onValueChange = { 
                                rawText = it
                                val parsedName = WorkoutParser.parseWorkoutName(it)
                                if (parsedName != null && workoutName.isBlank()) {
                                    workoutName = parsedName
                                }
                                val parsedExercises = WorkoutParser.parseExercises(it)
                                if (parsedExercises.isNotEmpty()) {
                                    exercises.clear()
                                    exercises.addAll(parsedExercises)
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(120.dp),
                            placeholder = { Text("Ex:\nFicha A\nSupino 3x12\nBiceps 12x4") },
                            textStyle = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "Lista de Exercícios (${exercises.size})", style = MaterialTheme.typography.titleMedium)
                IconButton(onClick = { showAddExerciseDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = "Adicionar Manualmente", tint = MaterialTheme.colorScheme.primary)
                }
            }
            if (exercisesError) {
                Text(
                    "Adicione pelo menos um exercício",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelSmall
                )
            }

            if (exercises.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text(
                        "Nenhum exercício adicionado ainda",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            } else {
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(exercises) { exercise ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(text = exercise.name, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                                Text(
                                    text = "${exercise.sets} séries x ${exercise.reps} reps",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                            // Campo de peso em aberto para o futuro
                            Text(
                                text = "Peso: ---",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            }
        }
    }
}

@Composable
fun AddExerciseDialog(onDismiss: () -> Unit, onAdd: (Exercise) -> Unit) {
    var name by remember { mutableStateOf("") }
    var sets by remember { mutableStateOf("3") }
    var reps by remember { mutableStateOf("12") }
    var weight by remember { mutableStateOf("") }
    var showValidation by remember { mutableStateOf(false) }
    val nameError = showValidation && name.isBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Novo Exercício") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nome") },
                    isError = nameError,
                    supportingText = { if (nameError) Text("Nome é obrigatório") }
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = sets, onValueChange = { sets = it }, label = { Text("Séries") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = reps, onValueChange = { reps = it }, label = { Text("Reps") }, modifier = Modifier.weight(1f))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                showValidation = true
                if (name.isNotBlank()) {
                    onAdd(Exercise(name, sets.toIntOrNull() ?: 0, reps, null))
                    onDismiss()
                }
            }) { Text("Adicionar") }
        }
    )
}
