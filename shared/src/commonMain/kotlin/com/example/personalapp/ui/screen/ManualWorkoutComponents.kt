package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.model.Exercise

/**
 * Supporting composables for [ManualWorkoutScreen] — the Smart Paste card, one exercise-list row,
 * and the add-exercise dialog — split out to keep the screen's own orchestration readable
 * (GOALS.md §10).
 */

@Composable
fun SmartPasteCard(
    isExpanded: Boolean,
    onToggleExpanded: () -> Unit,
    rawText: String,
    onRawTextChange: (String) -> Unit,
) {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
        ),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Importador Inteligente", style = MaterialTheme.typography.titleSmall)
                }
                TextButton(onClick = onToggleExpanded) {
                    Text(if (isExpanded) "Fechar" else "Abrir")
                }
            }

            if (isExpanded) {
                Text(
                    "Cole o texto (ex: Biceps 12x4) abaixo para identificar os exercícios automaticamente.",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                OutlinedTextField(
                    value = rawText,
                    onValueChange = onRawTextChange,
                    modifier = Modifier.fillMaxWidth().height(120.dp),
                    placeholder = { Text("Ex:\nFicha A\nSupino 3x12\nBiceps 12x4") },
                    textStyle = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
fun ExerciseListItem(exercise: Exercise) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = exercise.name, fontWeight = FontWeight.Bold)
                Text(
                    text = "${exercise.sets} séries x ${exercise.reps} reps",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            // Campo de peso em aberto para o futuro
            Text(
                text = "Peso: ---",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun AddExerciseDialog(onDismiss: () -> Unit, onAdd: (Exercise) -> Unit) {
    var name by remember { mutableStateOf("") }
    var sets by remember { mutableStateOf("3") }
    var reps by remember { mutableStateOf("12") }
    var showValidation by remember { mutableStateOf(false) }
    val nameError = showValidation && name.isBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Novo Exercício") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nome") },
                    isError = nameError,
                    supportingText = { if (nameError) Text("Nome é obrigatório") }
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = sets, onValueChange = { sets = it }, label = { Text("Séries") }, modifier = Modifier.weight(1f))
                    OutlinedTextField(value = reps, onValueChange = { reps = it }, label = { Text("Reps") }, modifier = Modifier.weight(1f))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                showValidation = true
                if (name.isNotBlank()) {
                    onAdd(Exercise(name, sets.toIntOrNull() ?: 0, reps, null))
                    onDismiss()
                }
            }) { Text("Adicionar") }
        }
    )
}
