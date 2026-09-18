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
    var showBiometricDialog by remember { mutableStateOf(false) }

    // GOALS.md §17e: the trainer's own AddBiometricDialog, reused as-is; the action exists only
    // while the trainer has granted canLogBiometrics (hidden, not disabled — firestore.rules is
    // the real gate, this just doesn't advertise something that would be denied).
    if (showBiometricDialog) {
        AddBiometricDialog(
            onDismiss = { showBiometricDialog = false },
            onSave = { w, bf ->
                viewModel.logOwnBiometric(w, bf)
                showBiometricDialog = false
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
                TextButton(onClick = { showBiometricDialog = true }) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Text("Registrar medida")
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
