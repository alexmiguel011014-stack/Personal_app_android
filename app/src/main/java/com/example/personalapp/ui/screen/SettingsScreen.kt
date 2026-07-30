package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.ui.viewmodel.SettingsViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val geminiKey by viewModel.geminiApiKey.collectAsState()
    val openaiKey by viewModel.openaiApiKey.collectAsState()

    var tempGeminiKey by remember(geminiKey) { mutableStateOf(geminiKey) }
    var tempOpenaiKey by remember(openaiKey) { mutableStateOf(openaiKey) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configurações de IA") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    viewModel.saveGeminiApiKey(tempGeminiKey)
                    viewModel.saveOpenaiApiKey(tempOpenaiKey)
                },
                icon = { Icon(Icons.Default.Save, contentDescription = null) },
                text = { Text("Salvar") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Conecte sua Inteligência Artificial",
                style = MaterialTheme.typography.titleMedium
            )
            
            OutlinedTextField(
                value = tempGeminiKey,
                onValueChange = { tempGeminiKey = it },
                label = { Text("Google Gemini API Key") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("Insira sua chave aqui...") }
            )

            OutlinedTextField(
                value = tempOpenaiKey,
                onValueChange = { tempOpenaiKey = it },
                label = { Text("OpenAI API Key") },
                modifier = Modifier.fillMaxWidth(),
                visualTransformation = PasswordVisualTransformation(),
                placeholder = { Text("Insira sua chave aqui...") }
            )

            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Por que preciso de chaves?",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Essas chaves permitem que o app gere treinos personalizados automaticamente usando os modelos mais avançados do mercado.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }
        }
    }
}
