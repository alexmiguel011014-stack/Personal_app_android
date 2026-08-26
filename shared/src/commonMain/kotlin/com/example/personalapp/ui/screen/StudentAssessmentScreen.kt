package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.model.PAR_Q_QUESTIONS
import com.example.personalapp.ui.viewmodel.StudentViewModel

// GOALS.md §17e: pre-fills goal/experienceLevel/trainingDays from the current profile (editable —
// the trainer's request wants a *current* snapshot, not necessarily what was true at linking
// time). Submitting clears pendingAssessmentRequest as part of the same repository call.
@Composable
fun StudentAssessmentScreen(viewModel: StudentViewModel, onSubmitted: () -> Unit) {
    val profile by viewModel.profile.collectAsState()
    val submitted by viewModel.assessmentSubmitted.collectAsState()

    val answers = remember { mutableStateMapOf<String, Boolean>() }
    var goal by remember(profile) { mutableStateOf(profile?.goal ?: "") }
    var experienceLevel by remember(profile) { mutableStateOf(profile?.experienceLevel ?: "") }
    var trainingDaysText by remember(profile) { mutableStateOf(profile?.trainingDays?.joinToString(", ") ?: "") }

    LaunchedEffect(submitted) {
        if (submitted) {
            viewModel.resetAssessmentSubmitted()
            onSubmitted()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Autoavaliação", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(
            "Seu personal solicitou uma autoavaliação. Responda com sinceridade — respostas " +
                "\"sim\" são revisadas com atenção, não é motivo para preocupação.",
            style = MaterialTheme.typography.bodyMedium
        )

        Text("Questionário de Prontidão (PAR-Q)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        PAR_Q_QUESTIONS.forEach { (key, question) ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(question, style = MaterialTheme.typography.bodyMedium)
                    androidx.compose.foundation.layout.Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(if (answers[key] == true) "Sim" else "Não")
                        Switch(
                            checked = answers[key] ?: false,
                            onCheckedChange = { answers[key] = it },
                        )
                    }
                }
            }
        }

        Text("Perfil atual", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        OutlinedTextField(value = goal, onValueChange = { goal = it }, label = { Text("Objetivo") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = experienceLevel, onValueChange = { experienceLevel = it }, label = { Text("Nível de experiência") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            value = trainingDaysText,
            onValueChange = { trainingDaysText = it },
            label = { Text("Dias de treino (separados por vírgula)") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                viewModel.submitAssessment(
                    answers = PAR_Q_QUESTIONS.associate { (key, _) -> key to (answers[key] ?: false) },
                    goal = goal,
                    experienceLevel = experienceLevel,
                    trainingDays = trainingDaysText.split(",").map { it.trim() }.filter { it.isNotBlank() },
                )
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Enviar Autoavaliação")
        }
    }
}
