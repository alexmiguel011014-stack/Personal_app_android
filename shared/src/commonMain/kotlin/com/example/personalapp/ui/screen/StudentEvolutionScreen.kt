package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.ui.viewmodel.StudentViewModel

@Composable
fun StudentEvolutionScreen(viewModel: StudentViewModel) {
    val biometrics by viewModel.biometrics.collectAsState()
    val workoutLogs by viewModel.workoutLogs.collectAsState()
    val profile by viewModel.profile.collectAsState()
    var showAddBiometricDialog by remember { mutableStateOf(false) }

    // GOALS.md §17e: hidden entirely, not just disabled, when the trainer hasn't granted
    // canLogBiometrics — reuses AddBiometricDialog, the same dialog the trainer-side
    // StudentDetailsScreen already uses, rather than a second bespoke entry form.
    if (showAddBiometricDialog) {
        AddBiometricDialog(
            onDismiss = { showAddBiometricDialog = false },
            onSave = { weight, bodyFat ->
                viewModel.logOwnBiometric(weight, bodyFat)
                showAddBiometricDialog = false
            }
        )
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Evolução de Peso", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (profile?.canLogBiometrics == true) {
                TextButton(onClick = { showAddBiometricDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Text("Nova Medida")
                }
            }
        }
        Card(modifier = Modifier.fillMaxWidth()) {
            WeightChart(biometrics = biometrics)
        }

        Text("Progressão de Carga", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        ExerciseProgressionChart(workoutLogs = workoutLogs)
    }
}
