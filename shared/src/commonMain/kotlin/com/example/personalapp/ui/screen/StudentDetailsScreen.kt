package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.ui.platform.rememberPlatformActions
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import com.example.personalapp.util.formatDate
import com.example.personalapp.util.formatDateTime

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentDetailsScreen(
    studentId: String,
    onBack: () -> Unit,
    onNavigateToManual: (String) -> Unit,
    onNavigateToAI: (String) -> Unit,
    onNavigateToPromptFicha: (String) -> Unit,
    onNavigateToEdit: (String) -> Unit,
    onNavigateToWorkoutBuilder: (String) -> Unit,
    viewModel: StudentDetailsViewModel = koinViewModel()
) {
    val student by viewModel.student.collectAsState()
    val biometrics by viewModel.biometrics.collectAsState()
    val workouts by viewModel.workouts.collectAsState()
    val workoutLogs by viewModel.workoutLogs.collectAsState()
    val inviteCode by viewModel.inviteCode.collectAsState()
    val inviteError by viewModel.inviteError.collectAsState()
    var showFichaDialog by remember { mutableStateOf(false) }
    var showBiometricDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val platformActions = rememberPlatformActions()
    val clipboardManager = LocalClipboardManager.current

    LaunchedEffect(studentId) {
        viewModel.loadStudent(studentId)
    }

    if (showFichaDialog) {
        FichaChoiceDialog(
            onDismiss = { showFichaDialog = false },
            onManual = { showFichaDialog = false; onNavigateToManual(studentId) },
            onAi = { showFichaDialog = false; onNavigateToAI(studentId) },
            onPromptExterno = { showFichaDialog = false; onNavigateToPromptFicha(studentId) },
        )
    }

    if (showBiometricDialog) {
        AddBiometricDialog(
            onDismiss = { showBiometricDialog = false },
            onSave = { w, bf ->
                viewModel.addBiometric(studentId, w, bf)
                showBiometricDialog = false
            }
        )
    }

    if (inviteCode != null || inviteError != null) {
        InviteCodeDialog(
            inviteCode = inviteCode,
            inviteError = inviteError,
            onDismiss = { viewModel.clearInvite() },
            onShare = { code ->
                platformActions.shareText("Seu código de convite Personal Tracker: $code")
            },
            onCopy = { code -> clipboardManager.setText(AnnotatedString(code)) },
        )
    }

    if (showDeleteConfirm) {
        DeleteStudentDialog(
            onDismiss = { showDeleteConfirm = false },
            onConfirm = { viewModel.deleteStudent { onBack() } },
        )
    }

    Scaffold(
        topBar = {
            StudentDetailsTopBar(
                studentName = student?.name,
                canGenerateInvite = student?.linked == false,
                onBack = onBack,
                onEditProfile = { onNavigateToEdit(studentId) },
                onGenerateInvite = { viewModel.generateInvite() },
                onDeleteStudent = { showDeleteConfirm = true },
            )
        }
    ) { padding ->
        student?.let { s ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        InfoRow(icon = Icons.Default.Phone, label = "Telefone", value = s.phone)
                        InfoRow(icon = Icons.Default.Flag, label = "Objetivo", value = s.goal)
                        InfoRow(icon = Icons.Default.CalendarMonth, label = "Dias de Treino", value = s.trainingDays.joinToString(", "))
                        InfoRow(icon = Icons.AutoMirrored.Filled.TrendingUp, label = "Nível", value = s.experienceLevel)

                        if (s.medicalNotes.isNotBlank()) {
                            Card(
                                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text("Observações Médicas", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onErrorContainer)
                                    Text(s.medicalNotes, color = MaterialTheme.colorScheme.onErrorContainer)
                                }
                            }
                        }
                    }
                }

                item {
                    Text("Evolução de Peso", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        WeightChart(biometrics = biometrics)
                    }
                }

                item {
                    Text("Progressão de Carga", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    ExerciseProgressionChart(workoutLogs = workoutLogs)
                }

                item {
                    Text("Atividade Recente", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (workoutLogs.isEmpty()) {
                        Text(
                            "Nenhuma sessão registrada pelo aluno ainda.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }

                items(workoutLogs.sortedByDescending { it.date }.take(10)) { log ->
                    val dateStr = formatDateTime(log.date)
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(12.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(log.exerciseName, fontWeight = FontWeight.Bold)
                                Text(dateStr, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(
                                log.performedSets.joinToString(" · ") { "${it.weight}x${it.reps}" },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Últimas Medidas", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { showBiometricDialog = true }) {
                            Icon(Icons.Default.Add, contentDescription = null)
                            Text("Nova Medida")
                        }
                    }
                }

                items(biometrics.take(5)) { bio ->
                    val dateStr = formatDate(bio.date)
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text(dateStr, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("${bio.weight} kg", fontWeight = FontWeight.Bold)
                            }
                            if (bio.bodyFat > 0) {
                                Text("${bio.bodyFat}% BF", color = MaterialTheme.colorScheme.secondary)
                            }
                        }
                    }
                }

                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Fichas de Treino", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { onNavigateToWorkoutBuilder(studentId) }) {
                            Text("Gerenciar")
                        }
                    }
                    if (workouts.isEmpty()) {
                        Text(
                            "Nenhum treino cadastrado ainda.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }

                items(workouts) { workout ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(workout.name, fontWeight = FontWeight.Bold)
                            Text(
                                "${workout.exercises.size} exercícios",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { showFichaDialog = true },
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = MaterialTheme.shapes.medium
                    ) {
                        Icon(Icons.Default.Description, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Ficha Personal", style = MaterialTheme.typography.titleMedium)
                    }
                }
            }
        } ?: Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
    }
}
