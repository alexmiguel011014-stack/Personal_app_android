package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.koin.androidx.compose.koinViewModel
import com.example.personalapp.ui.viewmodel.AdminViewModel
import com.example.personalapp.ui.viewmodel.ApiStatus
import com.example.personalapp.ui.viewmodel.AuthViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onLogout: () -> Unit,
    viewModel: AuthViewModel = koinViewModel(),
    adminViewModel: AdminViewModel = koinViewModel()
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Logs", "Gestão", "APIs")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Painel ADM") },
                actions = {
                    IconButton(onClick = onLogout) {
                        Icon(Icons.Default.Logout, contentDescription = "Sair")
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
                        icon = {
                            when (index) {
                                0 -> Icon(Icons.Default.Terminal, contentDescription = null)
                                1 -> Icon(Icons.Default.Group, contentDescription = null)
                                2 -> Icon(Icons.Default.Hub, contentDescription = null)
                                else -> Icon(Icons.Default.Settings, contentDescription = null)
                            }
                        }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                0 -> LogsTab()
                1 -> UserManagementTab(adminViewModel)
                2 -> ApiStatusTab(adminViewModel)
            }
        }
    }
}

@Composable
fun LogsTab() {
    val context = androidx.compose.ui.platform.LocalContext.current
    val projectId = remember {
        runCatching { com.google.firebase.FirebaseApp.getInstance().options.projectId }.getOrNull()
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Logs de Erro", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    "Erros do app (falhas de IA, sincronização com o Firestore) são enviados em tempo " +
                        "real para o Firebase Crashlytics, cobrindo todos os aparelhos, não só este.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = {
                        val url = if (projectId != null) {
                            "https://console.firebase.google.com/project/$projectId/crashlytics"
                        } else {
                            "https://console.firebase.google.com"
                        }
                        context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)))
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Abrir Firebase Console")
                }
            }
        }
    }
}

@Composable
fun UserManagementTab(viewModel: AdminViewModel) {
    val trainerCount by viewModel.trainerCount.collectAsState()
    val totalUserCount by viewModel.totalUserCount.collectAsState()
    val activeTrainers by viewModel.activeTrainers.collectAsState()
    val pendingRequests by viewModel.pendingTrainerRequests.collectAsState()
    val promoteResult by viewModel.promoteResult.collectAsState()
    val promoteError by viewModel.promoteError.collectAsState()

    var uidInput by remember { mutableStateOf("") }
    var nameInput by remember { mutableStateOf("") }

    // The initial load happens once in AdminViewModel's init{}, which can predate data written
    // after this screen was already open — re-check every time this tab is (re)entered.
    LaunchedEffect(Unit) {
        viewModel.loadTrainerRequests()
        viewModel.loadUserStats()
    }

    if (promoteResult != null || promoteError != null) {
        AlertDialog(
            onDismissRequest = { viewModel.clearPromoteResult() },
            title = { Text(if (promoteError != null) "Erro" else "Sucesso") },
            text = { Text(promoteError ?: promoteResult.orEmpty()) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.clearPromoteResult()
                    if (promoteError == null) {
                        uidInput = ""
                        nameInput = ""
                    }
                }) { Text("OK") }
            }
        )
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Gestão de Personais & Usuários", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatCard("Personais", trainerCount?.toString() ?: "...", Modifier.weight(1f))
            StatCard("Total Usuários", totalUserCount?.toString() ?: "...", Modifier.weight(1f))
        }

        Spacer(modifier = Modifier.height(24.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Solicitações Pendentes", style = MaterialTheme.typography.labelLarge)
            IconButton(onClick = {
                viewModel.loadTrainerRequests()
                viewModel.loadUserStats()
            }) {
                Icon(Icons.Default.Refresh, contentDescription = "Atualizar")
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        if (pendingRequests.isEmpty()) {
            Text(
                "Nenhuma solicitação no momento.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                pendingRequests.forEach { request ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(12.dp).fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(request.email, modifier = Modifier.weight(1f))
                            TextButton(onClick = { viewModel.rejectTrainerRequest(request) }) { Text("Recusar") }
                            Button(onClick = { viewModel.acceptTrainerRequest(request) }) { Text("Aceitar") }
                        }
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Promover manualmente (avançado)", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSecondaryContainer)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Só necessário se a solicitação não aparecer acima. Peça o UID da conta " +
                        "(Firebase Console → Authentication → Users) e cole abaixo.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = uidInput,
                    onValueChange = { uidInput = it },
                    label = { Text("UID do usuário") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = nameInput,
                    onValueChange = { nameInput = it },
                    label = { Text("Nome (opcional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = { viewModel.promoteToTrainer(uidInput, nameInput) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Promover a Trainer")
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        Text("Personais Ativos", style = MaterialTheme.typography.labelLarge)
        Spacer(modifier = Modifier.height(8.dp))
        if (activeTrainers.isEmpty()) {
            Text(
                "Nenhum personal cadastrado ainda.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                activeTrainers.forEach { trainer ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Text(trainer.name, modifier = Modifier.padding(12.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun ApiStatusTab(viewModel: AdminViewModel) {
    val firestoreStatus by viewModel.firestoreStatus.collectAsState()
    val openaiConfigured by viewModel.openaiConfigured.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Status das APIs", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))

        ApiStatusRow(
            "Firestore",
            when (firestoreStatus) {
                ApiStatus.CHECKING -> "Verificando..."
                ApiStatus.ONLINE -> "Online"
                ApiStatus.OFFLINE -> "Offline"
            },
            when (firestoreStatus) {
                ApiStatus.CHECKING -> MaterialTheme.colorScheme.outline
                ApiStatus.ONLINE -> SuccessGreen
                ApiStatus.OFFLINE -> MaterialTheme.colorScheme.error
            }
        )
        ApiStatusRow(
            "Google Gemini",
            "Ativo (Firebase AI Logic, grátis)",
            SuccessGreen
        )
        ApiStatusRow(
            "OpenAI ChatGPT (neste aparelho)",
            if (openaiConfigured) "Configurada" else "Não configurada",
            if (openaiConfigured) SuccessGreen else MaterialTheme.colorScheme.outline
        )
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            "Gemini é gerenciado centralmente pelo app (Firebase AI Logic, sem chave por " +
                "personal). OpenAI continua opcional, com uma chave por personal — o status " +
                "acima reflete só este aparelho, não a frota inteira.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun StatCard(label: String, value: String, modifier: Modifier) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, style = MaterialTheme.typography.labelSmall)
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ApiStatusRow(name: String, status: String, color: Color) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(name, fontWeight = FontWeight.Medium)
            Surface(color = color, shape = MaterialTheme.shapes.small) {
                Text(status, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}
