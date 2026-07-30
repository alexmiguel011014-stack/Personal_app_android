package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Save
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.ui.viewmodel.AIWorkoutViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AIWorkoutScreen(
    studentId: String,
    onBack: () -> Unit,
    viewModel: AIWorkoutViewModel = hiltViewModel()
) {
    val messages by viewModel.messages.collectAsState()
    val isGenerating by viewModel.isGenerating.collectAsState()
    var inputText by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Assistente de Ficha IA") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Voltar")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                items(messages) { message ->
                    Column {
                        ChatBubble(text = message.text, isUser = message.isFromUser)
                        
                        message.suggestedWorkouts?.forEach { workout ->
                            Spacer(modifier = Modifier.height(8.dp))
                            AISuggestedWorkoutCard(
                                workout = workout,
                                onSave = { viewModel.saveWorkout(workout) }
                            )
                        }
                    }
                }
                if (isGenerating) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp))
                        }
                    }
                }
            }

            Surface(tonalElevation = 2.dp) {
                Row(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Ex: Crie um treino de pernas...") },
                        maxLines = 3
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    IconButton(
                        onClick = {
                            viewModel.sendMessage(inputText, studentId)
                            inputText = ""
                        },
                        enabled = !isGenerating && inputText.isNotBlank()
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Enviar", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
fun AISuggestedWorkoutCard(workout: WorkoutEntity, onSave: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = workout.name, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                IconButton(onClick = onSave) {
                    Icon(Icons.Default.Save, contentDescription = "Salvar Treino")
                }
            }
            workout.exercises.forEach { ex ->
                Text(
                    text = "• ${ex.name}: ${ex.sets}x${ex.reps}",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

@Composable
fun ChatBubble(text: String, isUser: Boolean) {
    val clipboardManager = androidx.compose.ui.platform.LocalClipboardManager.current
    
    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = if (isUser) Alignment.CenterEnd else Alignment.CenterStart
    ) {
        Card(
            shape = RoundedCornerShape(
                topStart = 16.dp,
                topEnd = 16.dp,
                bottomStart = if (isUser) 16.dp else 0.dp,
                bottomEnd = if (isUser) 0.dp else 16.dp
            ),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
            ),
            modifier = Modifier.widthIn(max = 280.dp)
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                SelectionContainer {
                    Text(
                        text = text,
                        color = if (isUser) Color.White else MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
                
                if (!isUser) {
                    Spacer(modifier = Modifier.height(4.dp))
                    IconButton(
                        onClick = { 
                            clipboardManager.setText(androidx.compose.ui.text.AnnotatedString(text))
                        },
                        modifier = Modifier.size(24.dp).align(Alignment.End)
                    ) {
                        Icon(
                            Icons.Default.ContentCopy, 
                            contentDescription = "Copiar", 
                            modifier = Modifier.size(16.dp),
                            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.6f)
                        )
                    }
                }
            }
        }
    }
}
