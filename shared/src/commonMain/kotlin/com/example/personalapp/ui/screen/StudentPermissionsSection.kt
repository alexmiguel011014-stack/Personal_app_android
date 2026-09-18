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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.util.formatDateTime

// GOALS.md §17d: trainer-side "Permissões" block. Only rendered for a *linked* student — a draft
// (students/{id}) has no account, so there's nothing to grant. Two named switches, no generic
// feature-flag framework (§17a).
@Composable
fun StudentPermissionsSection(
    student: UserEntity,
    onSetPermissions: (canSelfAssess: Boolean, canLogBiometrics: Boolean) -> Unit,
    onRequestAssessment: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PermissionRow(
                title = "Autoavaliação",
                subtitle = "O aluno pode responder ao questionário PAR-Q+ quando você solicitar.",
                checked = student.canSelfAssess,
                onCheckedChange = { onSetPermissions(it, student.canLogBiometrics) },
            )
            PermissionRow(
                title = "Registrar medidas",
                subtitle = "O aluno pode lançar o próprio peso e % de gordura.",
                checked = student.canLogBiometrics,
                onCheckedChange = { onSetPermissions(student.canSelfAssess, it) },
            )
            Spacer(modifier = Modifier.height(4.dp))
            if (student.pendingAssessmentRequest) {
                Text(
                    "Autoavaliação solicitada — aguardando o aluno responder.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                // Request presupposes permission (§17a): disabled, not hidden, so the dependency
                // is visible.
                Button(onClick = onRequestAssessment, enabled = student.canSelfAssess) {
                    Text("Solicitar autoavaliação")
                }
                if (!student.canSelfAssess) {
                    Text(
                        "Libere a autoavaliação acima para poder solicitar.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun PermissionRow(title: String, subtitle: String, checked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(modifier = Modifier.width(8.dp))
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

// One submitted assessment. Any "sim" on the PAR-Q+ is surfaced loudly (errorContainer + the
// exact questions), never buried — that's the liability/safety point of the questionnaire.
@Composable
fun AssessmentCard(assessment: AssessmentEntity) {
    val flagged = assessment.flaggedQuestions()
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (flagged.isEmpty()) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.errorContainer
        ),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (flagged.isEmpty()) Icons.Default.CheckCircle else Icons.Default.Warning,
                    contentDescription = null,
                    tint = if (flagged.isEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(formatDateTime(assessment.submittedAt), fontWeight = FontWeight.Bold)
            }
            Text(
                "Objetivo: ${assessment.goal.ifBlank { "—" }} · Nível: ${assessment.experienceLevel.ifBlank { "—" }}",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(
                "Dias: ${assessment.trainingDays.joinToString(", ").ifBlank { "—" }}",
                style = MaterialTheme.typography.bodySmall,
            )
            if (flagged.isEmpty()) {
                Text("PAR-Q+: nenhuma resposta \"sim\".", style = MaterialTheme.typography.bodySmall)
            } else {
                Text(
                    "PAR-Q+: ${flagged.size} resposta(s) \"sim\" — avalie antes de prescrever:",
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                )
                flagged.forEach { q ->
                    Text("• ${q.text}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }
    }
}
