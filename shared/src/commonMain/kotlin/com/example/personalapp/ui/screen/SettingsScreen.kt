package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.ui.viewmodel.SettingsViewModel

// Tabbed shell (mirrors AdminDashboardScreen's NavigationBar + selectedTab pattern for
// consistency, GOALS.md §16a) — starts with one tab ("IA") but is structured so a future
// settings category is one more tabs-list entry + one more `when` branch, not a redesign.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = koinViewModel()
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("IA")

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
                        icon = { Icon(Icons.Default.Hub, contentDescription = null) }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> AiSettingsTab(viewModel)
            }
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

            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Google Gemini já está pronto para uso — não precisa de chave.",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "O acesso ao Gemini é gerenciado centralmente pelo app via Firebase, sem custo. " +
                            "Os provedores abaixo são opcionais — cada um exige sua própria chave.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }

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
        }
    }
}
