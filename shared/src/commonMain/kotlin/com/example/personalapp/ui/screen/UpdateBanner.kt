package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.service.UpdateStatus

// GOALS.md §18i: non-blocking — a dismissible card, never a dialog that gates the rest of the
// app. Renders nothing for UpToDate/CheckFailed (a failed background check shouldn't nag the
// trainer; the manual "Verificar atualização" button in Settings surfaces failures instead).
@Composable
fun UpdateBanner(status: UpdateStatus?, onAction: () -> Unit, onDismiss: () -> Unit) {
    when (status) {
        is UpdateStatus.UpdateAvailable -> Card(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
                Column(modifier = Modifier.weight(1f)) {
                    Text("Nova versão disponível: ${status.versionName}", color = MaterialTheme.colorScheme.onPrimaryContainer)
                    if (status.changelog.isNotBlank()) {
                        Text(status.changelog, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    }
                }
                TextButton(onClick = onAction) { Text("Atualizar") }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Dispensar", tint = MaterialTheme.colorScheme.onPrimaryContainer)
                }
            }
        }
        is UpdateStatus.SignatureExpiring -> Card(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Default.SystemUpdate, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer)
                Column(modifier = Modifier.weight(1f)) {
                    val message = if (status.daysRemaining <= 0) {
                        "A assinatura deste app expira hoje — abra o SideStore para renovar."
                    } else {
                        "A assinatura deste app expira em ${status.daysRemaining} dia(s) — abra o SideStore para renovar."
                    }
                    Text(message, color = MaterialTheme.colorScheme.onErrorContainer)
                }
                IconButton(onClick = onDismiss) {
                    Icon(Icons.Default.Close, contentDescription = "Dispensar", tint = MaterialTheme.colorScheme.onErrorContainer)
                }
            }
        }
        else -> Unit
    }
}
