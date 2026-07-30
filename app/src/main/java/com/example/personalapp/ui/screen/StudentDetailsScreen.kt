package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentDetailsScreen(
    studentId: String,
    onBack: () -> Unit,
    onNavigateToManual: (String) -> Unit,
    onNavigateToAI: (String) -> Unit,
    onNavigateToEdit: (String) -> Unit,
    viewModel: StudentDetailsViewModel = hiltViewModel()
) {
    val student by viewModel.student.collectAsState()
    val biometrics by viewModel.biometrics.collectAsState()
    val workouts by viewModel.workouts.collectAsState()
    var showFichaDialog by remember { mutableStateOf(false) }
    var showBiometricDialog by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var menuExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(studentId) {
        viewModel.loadStudent(studentId)
    }

    if (showFichaDialog) {
        AlertDialog(
            onDismissRequest = { showFichaDialog = false },
            title = { Text("Ficha Personal") },
            text = { Text("Como deseja criar os treinos deste aluno?") },
            confirmButton = {
                TextButton(onClick = { 
                    showFichaDialog = false
                    onNavigateToManual(studentId)
                }) {
                    Text("Manual")
                }
            },
            dismissButton = {
                TextButton(onClick = { 
                    showFichaDialog = false
                    onNavigateToAI(studentId)
                }) {
                    Text("Com IA")
                }
            }
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

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Excluir Aluno") },
            text = { Text("Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita.") },
            confirmButton = {
                Button(
                    onClick = { viewModel.deleteStudent { onBack() } },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) { Text("Excluir") }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteConfirm = false }) { Text("Cancelar") }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(student?.name ?: "Detalhes") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { menuExpanded = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Mais")
                        }
                        DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                            DropdownMenuItem(
                                text = { Text("Editar Perfil") },
                                onClick = { 
                                    menuExpanded = false
                                    onNavigateToEdit(studentId)
                                },
                                leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) }
                            )
                            DropdownMenuItem(
                                text = { Text("Excluir Aluno") },
                                onClick = { 
                                    menuExpanded = false
                                    showDeleteConfirm = true
                                },
                                leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = Color.Red) }
                            )
                        }
                    }
                }
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
                    val dateStr = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date(bio.date))
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text(dateStr, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
                                Text("${bio.weight} kg", fontWeight = FontWeight.Bold)
                            }
                            if (bio.bodyFat > 0) {
                                Text("${bio.bodyFat}% BF", color = MaterialTheme.colorScheme.secondary)
                            }
                        }
                    }
                }

                item {
                    Text("Fichas de Treino", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    if (workouts.isEmpty()) {
                        Text(
                            "Nenhum treino cadastrado ainda.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.Gray,
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

@Composable
fun AddBiometricDialog(onDismiss: () -> Unit, onSave: (Double, Double) -> Unit) {
    var weight by remember { mutableStateOf("") }
    var bf by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nova Medida") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = weight, onValueChange = { weight = it }, label = { Text("Peso (kg)") })
                OutlinedTextField(value = bf, onValueChange = { bf = it }, label = { Text("% Gordura (opcional)") })
            }
        },
        confirmButton = {
            Button(onClick = { 
                val w = weight.toDoubleOrNull() ?: 0.0
                val f = bf.toDoubleOrNull() ?: 0.0
                if (w > 0) onSave(w, f)
            }) { Text("Salvar") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    )
}

@Composable
fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = Color.Gray)
            Text(value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
