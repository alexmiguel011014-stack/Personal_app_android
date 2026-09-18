package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.local.entity.ParQ
import com.example.personalapp.ui.viewmodel.StudentViewModel

private val DAYS_OF_WEEK = listOf("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")

// GOALS.md §17e: the PAR-Q+ questionnaire plus the three profile fields the trainer's own form
// asks for, pre-filled from the live profile and editable. Reached only from the pending-request
// banner (the trainer's request is what makes it appear), submits one assessment doc.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentAssessmentScreen(
    onBack: () -> Unit,
    viewModel: StudentViewModel,
) {
    val profile by viewModel.profile.collectAsState()
    val saved by viewModel.assessmentSaved.collectAsState()
    val actionError by viewModel.actionError.collectAsState()

    val answers = remember { mutableStateMapOf<String, Boolean>().apply { ParQ.QUESTIONS.forEach { put(it.key, false) } } }
    var goal by remember(profile?.goal) { mutableStateOf(profile?.goal ?: "") }
    var experienceLevel by remember(profile?.experienceLevel) { mutableStateOf(profile?.experienceLevel ?: "") }
    val selectedDays = remember(profile?.trainingDays) { (profile?.trainingDays ?: emptyList()).toMutableStateList() }
    var submitting by remember { mutableStateOf(false) }

    LaunchedEffect(saved) {
        if (saved) {
            viewModel.resetAssessmentSaved()
            onBack()
        }
    }
    LaunchedEffect(actionError) { if (actionError != null) submitting = false }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Autoavaliação") },
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
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "Seu personal pediu esta autoavaliação. Responda com sinceridade — uma resposta \"sim\" não impede o treino, ela ajuda a montar uma ficha segura para você.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Text("Questionário de prontidão (PAR-Q+)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ParQ.QUESTIONS.forEach { question ->
                        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(question.text, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.width(8.dp))
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Switch(
                                    checked = answers[question.key] == true,
                                    onCheckedChange = { answers[question.key] = it },
                                )
                                Text(
                                    if (answers[question.key] == true) "Sim" else "Não",
                                    style = MaterialTheme.typography.labelSmall,
                                )
                            }
                        }
                    }
                }
            }

            Text("Seu perfil hoje", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            OutlinedTextField(
                value = goal,
                onValueChange = { goal = it },
                label = { Text("Objetivo") },
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = experienceLevel,
                onValueChange = { experienceLevel = it },
                label = { Text("Nível de experiência") },
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Dias que consegue treinar", style = MaterialTheme.typography.bodyMedium)
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DAYS_OF_WEEK.take(4).forEach { day -> DayChip(day, selectedDays) }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                DAYS_OF_WEEK.drop(4).forEach { day -> DayChip(day, selectedDays) }
            }

            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = {
                    submitting = true
                    viewModel.submitAssessment(answers.toMap(), goal.trim(), experienceLevel.trim(), selectedDays.toList())
                },
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (submitting) "Enviando..." else "Enviar para o personal")
            }
        }
    }
}

@Composable
private fun DayChip(day: String, selectedDays: MutableList<String>) {
    val selected = day in selectedDays
    FilterChip(
        selected = selected,
        onClick = { if (selected) selectedDays.remove(day) else selectedDays.add(day) },
        label = { Text(day.take(3)) },
    )
}
