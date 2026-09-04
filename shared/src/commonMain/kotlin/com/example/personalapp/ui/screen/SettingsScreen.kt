package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.data.service.UpdateStatus
import com.example.personalapp.ui.platform.rememberPlatformActions
import com.example.personalapp.ui.viewmodel.SettingsViewModel
import com.example.personalapp.ui.viewmodel.UpdateViewModel

// Tabbed shell (mirrors AdminDashboardScreen's NavigationBar + selectedTab pattern for
// consistency, GOALS.md §16a) — starts with "IA"/"Sobre", structured so a future settings
// category is one more tabs-list entry + one more `when` branch, not a redesign.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = koinViewModel(),
    updateViewModel: UpdateViewModel = koinViewModel(),
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("IA", "Sobre")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configurações") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, label ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        label = { Text(label) },
                        icon = { Icon(if (index == 0) Icons.Default.Hub else Icons.Default.Info, contentDescription = null) }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> AiSettingsTab(viewModel)
                1 -> AboutTab(updateViewModel)
            }
        }
    }
}

@Composable
private fun AboutTab(viewModel: UpdateViewModel = koinViewModel()) {
    val status by viewModel.status.collectAsState()
    val isChecking by viewModel.isChecking.collectAsState()
    val platformActions = rememberPlatformActions()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text("Personal Tracker — versão ${viewModel.currentVersionName}", style = MaterialTheme.typography.titleMedium)

        Button(
            onClick = { viewModel.checkForUpdate() },
            enabled = !isChecking,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (isChecking) "Verificando..." else "Verificar atualização")
        }

        when (val current = status) {
            null -> Unit
            is UpdateStatus.UpToDate -> Text("Você já está na versão mais recente.")
            is UpdateStatus.CheckFailed -> Text(
                "Não foi possível verificar agora: ${current.message}",
                color = MaterialTheme.colorScheme.error
            )
            is UpdateStatus.UpdateAvailable -> Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Nova versão disponível: ${current.versionName}")
                    if (current.changelog.isNotBlank()) Text(current.changelog, style = MaterialTheme.typography.bodySmall)
                    if (current.downloadUrl.isNotBlank()) {
                        Button(onClick = { platformActions.openUrl(current.downloadUrl) }) {
                            Text("Baixar atualização")
                        }
                    }
                }
            }
            is UpdateStatus.SignatureExpiring -> Text(
                "A assinatura deste app expira em ${current.daysRemaining} dia(s) — abra o SideStore para renovar.",
                color = MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
private fun AiSettingsTab(viewModel: SettingsViewModel) {
    val openaiKey by viewModel.openaiApiKey.collectAsState()
    val deepseekKey by viewModel.deepseekApiKey.collectAsState()
    val claudeKey by viewModel.claudeApiKey.collectAsState()

    var tempOpenaiKey by remember(openaiKey) { mutableStateOf(openaiKey) }
    var tempDeepseekKey by remember(deepseekKey) { mutableStateOf(deepseekKey) }
    var tempClaudeKey by remember(claudeKey) { mutableStateOf(claudeKey) }

    Scaffold(
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.saveAllKeys(tempOpenaiKey, tempDeepseekKey, tempClaudeKey) },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text("Salvar") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Conecte sua Inteligência Artificial",
                style = MaterialTheme.typography.titleMedium
            )

            OutlinedTextField(
                value = tempOpenaiKey,
                onValueChange = { tempOpenaiKey = it },
                label = { Text("OpenAI (ChatGPT) API Key (opcional)") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("Insira sua chave aqui...") }
            )

            OutlinedTextField(
                value = tempDeepseekKey,
                onValueChange = { tempDeepseekKey = it },
                label = { Text("DeepSeek API Key (opcional)") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("Insira sua chave aqui...") }
            )

            OutlinedTextField(
                value = tempClaudeKey,
                onValueChange = { tempClaudeKey = it },
                label = { Text("Claude (Anthropic) API Key (opcional)") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("Insira sua chave aqui...") }
            )

            // GOALS.md §14c: Gemini stays available (no key needed, managed via Firebase) but is
            // deliberately not the highlighted/lead option here anymore — plain text, not a card.
            Text(
                text = "Google Gemini também está disponível, sem precisar de chave (gerenciado " +
                    "centralmente pelo app via Firebase).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
