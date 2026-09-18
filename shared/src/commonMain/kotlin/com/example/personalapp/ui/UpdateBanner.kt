package com.example.personalapp.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.example.personalapp.data.service.UpdateChecker
import com.example.personalapp.data.service.UpdateStatus
import org.koin.compose.koinInject

// GOALS.md §18i, "automatic check": runs UpdateChecker once when the app starts and shows a
// dismissible, non-blocking card above whatever screen is current. Silent when up to date or
// when the manifest couldn't be fetched (offline is normal; Settings has the manual check).
@Composable
fun UpdateBanner(checker: UpdateChecker = koinInject()) {
    val status by produceState<UpdateStatus?>(initialValue = null, checker) { value = checker.check() }
    var dismissed by remember { mutableStateOf(false) }
    val current = status
    if (dismissed || current == null || current is UpdateStatus.UpToDate || current is UpdateStatus.Failed) return

    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 12.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = when (current) {
                        is UpdateStatus.UpdateAvailable -> "Nova versão ${current.versionName} disponível"
                        is UpdateStatus.SignatureExpiring -> "Assinatura do app expira em ${current.daysLeft} dia(s)"
                        else -> ""
                    },
                    style = MaterialTheme.typography.titleSmall,
                )
                Spacer(modifier = Modifier.height(4.dp))
                UpdateActions(current)
            }
            Spacer(modifier = Modifier.width(4.dp))
            IconButton(onClick = { dismissed = true }) {
                Icon(Icons.Default.Close, contentDescription = "Dispensar")
            }
        }
    }
}

// Shared between the launch banner and the Settings tab: the status text plus its action.
// Android: opens the .apk URL — the system's own install prompt takes over (same sideload flow
// as today's manual reinstall). iOS: SideStore re-signs from its source, so the action is to
// open SideStore and refresh; `sidestore://` is attempted, instructions are shown regardless.
@Composable
fun UpdateActions(status: UpdateStatus) {
    val uriHandler = LocalUriHandler.current
    when (status) {
        is UpdateStatus.UpdateAvailable -> {
            if (status.changelog.isNotBlank()) {
                Text(status.changelog, style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(8.dp))
            }
            if (status.downloadUrl != null) {
                Button(onClick = { runCatching { uriHandler.openUri(status.downloadUrl) } }) {
                    Text("Baixar atualização")
                }
            } else {
                Text(
                    "Abra o SideStore e toque em \"Refresh All\" para instalar a nova versão.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = { runCatching { uriHandler.openUri("sidestore://") } }) {
                    Text("Abrir SideStore")
                }
            }
        }
        is UpdateStatus.SignatureExpiring -> {
            Text(
                "Depois disso o app deixa de abrir até ser renovado. Abra o SideStore e toque em " +
                    "\"Refresh All\" (ele renova a assinatura sem reinstalar).",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(onClick = { runCatching { uriHandler.openUri("sidestore://") } }) {
                Text("Abrir SideStore")
            }
        }
        is UpdateStatus.UpToDate -> Text("Você está na versão mais recente.", style = MaterialTheme.typography.bodyMedium)
        is UpdateStatus.Failed -> Text(status.message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
    }
}
