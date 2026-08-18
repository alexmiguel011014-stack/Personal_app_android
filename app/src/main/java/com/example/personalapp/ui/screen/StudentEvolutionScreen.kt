package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.ui.viewmodel.StudentViewModel

@Composable
fun StudentEvolutionScreen(viewModel: StudentViewModel) {
    val biometrics by viewModel.biometrics.collectAsState()
    val workoutLogs by viewModel.workoutLogs.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Evolução de Peso", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Card(modifier = Modifier.fillMaxWidth()) {
            WeightChart(biometrics = biometrics)
        }

        Text("Progressão de Carga", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ExerciseProgressionChart(workoutLogs = workoutLogs)
    }
}
