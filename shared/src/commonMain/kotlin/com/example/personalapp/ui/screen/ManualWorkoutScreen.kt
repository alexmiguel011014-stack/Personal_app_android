@file:OptIn(kotlin.uuid.ExperimentalUuidApi::class)

package com.example.personalapp.ui.screen
import com.example.personalapp.util.currentTimeMillis

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
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import com.example.personalapp.util.WorkoutParser
import kotlin.uuid.Uuid

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManualWorkoutScreen(
    studentId: String,
    onBack: () -> Unit,
    workoutId: String? = null,
    viewModel: WorkoutViewModel = koinViewModel()
) {
    var workoutName by remember { mutableStateOf("") }
    val exercises = remember { mutableStateListOf<Exercise>() }
    var showAddExerciseDialog by remember { mutableStateOf(false) }
    var showValidation by remember { mutableStateOf(false) }
    val nameError = showValidation && workoutName.isBlank()
    val exercisesError = showValidation && exercises.isEmpty()

    // Edit mode: prefill from the existing workout once it loads (see WorkoutBuilderScreen's
    // "Editar" icon — GOALS.md's own note said reuse this screen prefilled, so it's the same
    // form, just seeded with the workout being edited instead of starting blank).
    val editingWorkout by viewModel.editingWorkout.collectAsState()
    LaunchedEffect(workoutId) {
        if (workoutId != null) viewModel.loadWorkoutForEdit(workoutId)
    }
    LaunchedEffect(editingWorkout) {
        editingWorkout?.let { workout ->
            workoutName = workout.name
            exercises.clear()
            exercises.addAll(workout.exercises)
        }
    }

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
                title = { Text(if (workoutId != null) "Editar Treino" else "Novo Treino") },
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
                        val existing = editingWorkout
                        val workout = if (existing != null) {
                            existing.copy(name = workoutName, exercises = exercises.toList())
                        } else {
                            WorkoutEntity(
                                id = Uuid.random().toString(),
                                studentId = studentId,
                                name = workoutName,
                                isActive = true,
                                exercises = exercises.toList(),
                                createdAt = currentTimeMillis()
                            )
                        }
                        if (existing != null) viewModel.updateWorkout(workout) else viewModel.insertWorkout(workout)
                        onBack()
                    }
                },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text(if (workoutId != null) "Salvar Alterações" else "Salvar Ficha") }
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
