package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.ui.viewmodel.AuthViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onLogout: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
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
                1 -> UserManagementTab()
                2 -> ApiStatusTab()
            }
        }
    }
}

@Composable
fun LogsTab() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Logs de Erro", style = MaterialTheme.typography.titleMedium)
            Row {
                TextButton(onClick = { /* Copiar */ }) { Text("Copiar") }
                TextButton(onClick = { /* Limpar */ }) { Text("Limpar") }
            }
        }
        
        Card(
            modifier = Modifier.fillMaxSize(),
            colors = CardDefaults.cardColors(containerColor = Color.Black)
        ) {
            LazyColumn(modifier = Modifier.padding(8.dp)) {
                item {
                    Text(
                        "[18:30:22] ERROR: Gemini API Key invalid\n[18:31:05] WARN: Firestore sync slow",
                        color = Color.Green,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
        }
    }
}

@Composable
fun UserManagementTab() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Gestão de Personais & Usuários", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            StatCard("Personais", "12", Modifier.weight(1f))
            StatCard("Total Usuários", "154", Modifier.weight(1f))
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        Text("Personais Ativos", style = MaterialTheme.typography.labelLarge)
        // Lista de personais aqui...
    }
}

@Composable
fun ApiStatusTab() {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Status das APIs", style = MaterialTheme.typography.titleMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        ApiStatusRow("Google Gemini", "Online", Color(0xFF4CAF50))
        ApiStatusRow("OpenAI ChatGPT", "Online", Color(0xFF4CAF50))
        ApiStatusRow("Firestore", "Online", Color(0xFF4CAF50))
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
