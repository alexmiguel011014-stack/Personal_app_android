package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
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
    // Non-empty only when the pasted text carried [Muscle:coef] annotations (GOALS.md §15c) —
    // a manually-typed or plain-text-pasted ficha shows nothing extra here, no regression.
    val effectiveVolume = remember(exercises.toList()) { WorkoutParser.calculateEffectiveVolume(exercises) }

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

            SmartPasteCard(
                isExpanded = isSmartPasteExpanded,
                onToggleExpanded = { isSmartPasteExpanded = !isSmartPasteExpanded },
                rawText = rawText,
                onRawTextChange = {
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
            )

            if (effectiveVolume.isNotEmpty()) {
                Spacer(modifier = Modifier.height(16.dp))
                EffectiveVolumeSummary(effectiveVolume)
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
                items(exercises) { exercise -> ExerciseListItem(exercise) }
            }
            }
        }
    }
}
