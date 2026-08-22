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
import org.koin.androidx.compose.koinViewModel
import com.example.personalapp.ui.viewmodel.TrainerViewModel

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun AddStudentScreen(
    onBack: () -> Unit,
    viewModel: TrainerViewModel = koinViewModel()
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("Masculino") }
    var goal by remember { mutableStateOf("") }
    var level by remember { mutableStateOf("Iniciante") }
    var notes by remember { mutableStateOf("") }
    var weight by remember { mutableStateOf("") }
    var height by remember { mutableStateOf("") }
    val selectedDays = remember { mutableStateListOf<String>() }
    var showValidation by remember { mutableStateOf(false) }

    val daysOfWeek = listOf("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")
    val focusManager = LocalFocusManager.current
    val nameError = showValidation && name.isBlank()
    val daysError = showValidation && selectedDays.isEmpty()

    Scaffold(
        modifier = Modifier.imePadding(),
        topBar = {
            TopAppBar(
                title = { Text("Novo Aluno") },
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
                        viewModel.addStudent(
                            name = name,
                            phone = phone,
                            gender = gender,
                            goal = goal,
                            level = level,
                            notes = notes,
                            trainingDays = selectedDays.toList(),
                            weight = weight.replace(",", ".").toDoubleOrNull() ?: 0.0,
                            height = height.replace(",", ".").toDoubleOrNull() ?: 0.0
                        )
                        onBack()
                    }
                },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text("Cadastrar") }
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
                label = { Text("Objetivo (ex: Hipertrofia)") },
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

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                OutlinedTextField(
                    value = weight,
                    onValueChange = { weight = it },
                    label = { Text("Peso (kg)") },
                    modifier = Modifier.weight(1f),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Right) })
                )
                OutlinedTextField(
                    value = height,
                    onValueChange = { input ->
                        val cleaned = input.filter { it.isDigit() }
                        height = when {
                            cleaned.length >= 3 -> {
                                val first = cleaned.take(1)
                                val rest = cleaned.substring(1, 3)
                                "$first,$rest"
                            }
                            else -> cleaned
                        }
                    },
                    label = { Text("Altura (m)") },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Ex: 185") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next),
                    keyboardActions = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Down) })
                )
            }

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Observações Médicas / Lesões") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focusManager.clearFocus() })
            )
            
            Spacer(modifier = Modifier.height(100.dp))
        }
    }
}
