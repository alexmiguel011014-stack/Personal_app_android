package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import org.koin.androidx.compose.koinViewModel
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.ui.viewmodel.PromptFichaViewModel
import com.example.personalapp.util.WorkoutParser
import kotlinx.coroutines.launch
import java.util.UUID

// The provider-agnostic half of GOALS.md §15: instead of calling an AI API in-app, hand the
// trainer a ready-to-run prompt for whichever AI app they already have, then reuse the existing
// Smart Paste importer (SmartPasteCard/WorkoutParser, extended in §15c) to bring the reply back
// in as a real, editable ficha.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PromptFichaScreen(
    studentId: String,
    onBack: () -> Unit,
    viewModel: PromptFichaViewModel = koinViewModel()
) {
    val student by viewModel.student.collectAsState()
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var userRequest by remember { mutableStateOf("") }
    var workoutName by remember { mutableStateOf("") }
    val exercises = remember { mutableStateListOf<Exercise>() }
    var showValidation by remember { mutableStateOf(false) }
    val nameError = showValidation && workoutName.isBlank()
    val exercisesError = showValidation && exercises.isEmpty()

    var rawText by remember { mutableStateOf("") }
    var isSmartPasteExpanded by remember { mutableStateOf(true) }

    val effectiveVolume = remember(exercises.toList()) { WorkoutParser.calculateEffectiveVolume(exercises) }

    LaunchedEffect(studentId) {
        viewModel.loadStudent(studentId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Prompt para IA Externa") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
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
                .verticalScroll(rememberScrollState())
        ) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "1. Descreva o que você quer abaixo. 2. Copie o prompt. 3. Cole em qualquer IA " +
                            "que você já usa (ChatGPT, Gemini, Claude...). 4. Cole a resposta dela no " +
                            "Importador Inteligente mais abaixo.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = userRequest,
                onValueChange = { userRequest = it },
                label = { Text("O que você quer nesta ficha?") },
                placeholder = { Text("Ex: treino de costas e bíceps, foco em volume, 12 séries efetivas de costas na semana...") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = {
                    val prompt = viewModel.buildPrompt(userRequest)
                    clipboardManager.setText(AnnotatedString(prompt))
                    scope.launch { snackbarHostState.showSnackbar("Prompt copiado! Cole na sua IA de preferência.") }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Copiar Prompt")
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))

            OutlinedTextField(
                value = workoutName,
                onValueChange = { workoutName = it },
                label = { Text("Nome do Treino (ex: Ficha A)") },
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

            Text(text = "Lista de Exercícios (${exercises.size})", style = MaterialTheme.typography.titleMedium)
            if (exercisesError) {
                Text(
                    "Cole a resposta da IA acima para preencher os exercícios",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelSmall
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            if (exercises.isEmpty()) {
                Text(
                    "Nenhum exercício importado ainda",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyMedium
                )
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    exercises.forEach { exercise -> ExerciseListItem(exercise) }
                }
            }

            Spacer(modifier = Modifier.height(80.dp))
        }
    }
}

// Per REPERTOIRE.md §2: never show a bare effective-volume number without a range/context —
// Hevy/Boostcamp/RP Hypertrophy all frame it against a landmark band, not an isolated figure.
@Composable
fun EffectiveVolumeSummary(effectiveVolume: Map<String, Double>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("Volume Efetivo por Músculo (nesta ficha)", style = MaterialTheme.typography.titleSmall)
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                "Faixa ideal de referência (intermediário): ~12-20 séries efetivas/semana por músculo.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(8.dp))
            effectiveVolume.entries.sortedByDescending { it.value }.forEach { (muscle, volume) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(muscle, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        "%.1f séries efetivas".format(volume),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
