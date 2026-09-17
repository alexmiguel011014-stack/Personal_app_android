package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun EditStudentScreen(
    studentId: String,
    onBack: () -> Unit,
    viewModel: StudentDetailsViewModel = koinViewModel()
) {
    val student by viewModel.student.collectAsState()
    
    // Form state
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("Masculino") }
    var goal by remember { mutableStateOf("") }
    var level by remember { mutableStateOf("Iniciante") }
    var notes by remember { mutableStateOf("") }
    val selectedDays = remember { mutableStateListOf<String>() }
    var showValidation by remember { mutableStateOf(false) }

    val daysOfWeek = listOf("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")
    val focusManager = LocalFocusManager.current
    val nameError = showValidation && name.isBlank()
    val daysError = showValidation && selectedDays.isEmpty()

    LaunchedEffect(studentId) {
        viewModel.loadStudent(studentId)
    }

    LaunchedEffect(student) {
        student?.let {
            name = it.name
            phone = it.phone
            gender = it.gender
            goal = it.goal
            level = it.experienceLevel
            notes = it.medicalNotes
            selectedDays.clear()
            selectedDays.addAll(it.trainingDays)
        }
    }

    Scaffold(
        modifier = Modifier.imePadding(),
        topBar = {
            TopAppBar(
                title = { Text("Editar Aluno") },
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
                    if (name.isNotBlank() && selectedDays.isNotEmpty()) {
                        student?.let {
                            val updated = it.copy(
                                name = name,
                                phone = phone,
                                gender = gender,
                                goal = goal,
                                experienceLevel = level,
                                medicalNotes = notes,
                                trainingDays = selectedDays.toList()
                            )
                            viewModel.updateStudent(updated) { onBack() }
                        }
                    }
                },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text("Salvar Alterações") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Nome Completo") },
                modifier = Modifier.fillMaxWidth(),
                isError = nameError,
                supportingText = { if (nameError) Text("Nome é obrigatório") },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
            )

            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("WhatsApp / Telefone") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
            )

            Text("Sexo")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Masculino", "Feminino").forEach { item ->
                    FilterChip(
                        selected = gender == item,
                        onClick = { gender = item },
                        label = { Text(item) }
                    )
                }
            }

            OutlinedTextField(
                value = goal,
                onValueChange = { goal = it },
                label = { Text("Objetivo") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
            )

            Text("Nível de Experiência")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Iniciante", "Interm.", "Avançado").forEach { item ->
                    FilterChip(
                        selected = level == item,
                        onClick = { level = item },
                        label = { Text(item) }
                    )
                }
            }

            Text("Dias de Treino")
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                daysOfWeek.forEach { day ->
                    val isSelected = selectedDays.contains(day)
                    FilterChip(
                        selected = isSelected,
                        onClick = {
                            if (isSelected) selectedDays.remove(day) else selectedDays.add(day)
                        },
                        label = { Text(day) }
                    )
                }
            }
            if (daysError) {
                Text(
                    "Selecione pelo menos um dia de treino",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.labelSmall
                )
            }

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Observações Médicas") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() })
            )
            
            Spacer(modifier = Modifier.height(100.dp))
        }
    }
}
