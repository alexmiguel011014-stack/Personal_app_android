package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.model.PAR_Q_QUESTIONS
import com.example.personalapp.util.formatDate

/**
 * Supporting composables for [StudentDetailsScreen] — dialogs, the top bar's overflow menu, and
 * small display rows — split out to keep the screen's own orchestration readable (GOALS.md §10).
 */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentDetailsTopBar(
    studentName: String?,
    canGenerateInvite: Boolean,
    onBack: () -> Unit,
    onEditProfile: () -> Unit,
    onGenerateInvite: () -> Unit,
    onDeleteStudent: () -> Unit,
) {
    var menuExpanded by remember { mutableStateOf(false) }
    TopAppBar(
        title = { Text(studentName ?: "Detalhes") },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
            }
        },
        actions = {
            androidx.compose.foundation.layout.Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "Mais")
                }
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    DropdownMenuItem(
                        text = { Text("Editar Perfil") },
                        onClick = {
                            menuExpanded = false
                            onEditProfile()
                        },
                        leadingIcon = { Icon(Icons.Default.Edit, contentDescription = null) }
                    )
                    if (canGenerateInvite) {
                        DropdownMenuItem(
                            text = { Text("Gerar Convite") },
                            onClick = {
                                menuExpanded = false
                                onGenerateInvite()
                            },
                            leadingIcon = { Icon(Icons.Default.PersonAdd, contentDescription = null) }
                        )
                    }
                    DropdownMenuItem(
                        text = { Text("Excluir Aluno") },
                        onClick = {
                            menuExpanded = false
                            onDeleteStudent()
                        },
                        leadingIcon = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) }
                    )
                }
            }
        }
    )
}

// Three ways to build a ficha (GOALS.md §16a): a fully manual builder, a live in-app AI chat
// (now 4 providers, §16), or a formatted-prompt to run in whatever AI app the trainer already
// has (§15) — AlertDialog only offers two button slots, so all three choices render as a
// vertical list inside the text area instead of confirm/dismiss.
@Composable
fun FichaChoiceDialog(
    onDismiss: () -> Unit,
    onManual: () -> Unit,
    onAi: () -> Unit,
    onPromptExterno: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Ficha Personal") },
        text = {
            Column {
                Text("Como deseja criar os treinos deste aluno?")
                Spacer(modifier = Modifier.height(12.dp))
                TextButton(onClick = onManual, modifier = Modifier.fillMaxWidth()) { Text("Manual") }
                TextButton(onClick = onAi, modifier = Modifier.fillMaxWidth()) { Text("IA no app") }
                TextButton(onClick = onPromptExterno, modifier = Modifier.fillMaxWidth()) { Text("Prompt para IA externa") }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } }
    )
}

@Composable
fun DeleteStudentDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Excluir Aluno") },
        text = { Text("Tem certeza que deseja excluir este aluno? Esta ação não pode ser desfeita.") },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) { Text("Excluir") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        }
    )
}

@Composable
fun InviteCodeDialog(
    inviteCode: String?,
    inviteError: String?,
    onDismiss: () -> Unit,
    onShare: (String) -> Unit,
    onCopy: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Convite gerado") },
        text = {
            if (inviteError != null) {
                Text(inviteError, color = MaterialTheme.colorScheme.error)
            } else if (inviteCode != null) {
                Column {
                    Text("Envie este código para o aluno vincular a conta dele:")
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        inviteCode,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            if (inviteCode != null) {
                TextButton(onClick = { onShare(inviteCode) }) { Text("Compartilhar") }
            }
        },
        dismissButton = {
            if (inviteCode != null) {
                TextButton(onClick = { onCopy(inviteCode) }) { Text("Copiar") }
            } else {
                TextButton(onClick = onDismiss) { Text("Fechar") }
            }
        }
    )
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

// GOALS.md §17d: two named, trainer-controlled toggles — not a generic feature-flag framework,
// see GOALS.md §17a for why. Only shown for a linked student (StudentDetailsScreen's caller
// checks this) — a draft has no Firebase Auth account to grant anything to.
@Composable
fun PermissionsSection(
    canSelfAssess: Boolean,
    canLogBiometrics: Boolean,
    pendingAssessmentRequest: Boolean,
    onPermissionsChange: (canSelfAssess: Boolean, canLogBiometrics: Boolean) -> Unit,
    onRequestAssessment: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Permissões", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Aluno pode se autoavaliar")
            Switch(checked = canSelfAssess, onCheckedChange = { onPermissionsChange(it, canLogBiometrics) })
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Aluno pode registrar biometria")
            Switch(checked = canLogBiometrics, onCheckedChange = { onPermissionsChange(canSelfAssess, it) })
        }
        Button(
            onClick = onRequestAssessment,
            enabled = canSelfAssess && !pendingAssessmentRequest,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (pendingAssessmentRequest) "Autoavaliação solicitada" else "Solicitar Autoavaliação")
        }
    }
}

// Newest first, any "yes" PAR-Q answer flagged visibly (GOALS.md §17a/§17d — a "yes" is a
// liability/safety-relevant signal the trainer must see, not just log).
@Composable
fun AssessmentHistorySection(assessments: List<AssessmentEntity>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Histórico de Autoavaliação", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (assessments.isEmpty()) {
            Text(
                "Nenhuma autoavaliação enviada ainda.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        assessments.forEach { assessment ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = if (assessment.hasHealthRiskFlag) {
                    CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                } else {
                    CardDefaults.cardColors()
                }
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(formatDate(assessment.submittedAt), fontWeight = FontWeight.Bold)
                        if (assessment.hasHealthRiskFlag) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = "Resposta de risco à saúde",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    Text("Objetivo: ${assessment.goal}", style = MaterialTheme.typography.bodySmall)
                    Text("Nível: ${assessment.experienceLevel}", style = MaterialTheme.typography.bodySmall)
                    assessment.parQAnswers.filterValues { it }.keys.forEach { key ->
                        val questionText = PAR_Q_QUESTIONS.firstOrNull { it.first == key }?.second ?: key
                        Text(
                            "⚠ $questionText",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (assessment.hasHealthRiskFlag) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun InfoRow(icon: ImageVector, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}
