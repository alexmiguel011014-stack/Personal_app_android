package com.example.personalapp.ui.screen

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.data.repository.UserRole
import com.example.personalapp.ui.viewmodel.AuthState
import com.example.personalapp.ui.viewmodel.AuthViewModel

@Composable
fun LoginScreen(
    viewModel: AuthViewModel = hiltViewModel()
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf("Personal") }
    var isRegisterMode by remember { mutableStateOf(false) }

    val authState by viewModel.authState.collectAsState()
    val authenticatedRole = (authState as? AuthState.Authenticated)?.role

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Personal Tracker",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
        Text(
            text = "Seu parceiro de treinos inteligente",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary
        )

        Spacer(modifier = Modifier.height(32.dp))

        // Toggle entre Personal e Aluno
        TabRow(
            selectedTabIndex = if (selectedRole == "Personal") 0 else 1,
            containerColor = androidx.compose.ui.graphics.Color.Transparent,
            modifier = Modifier.fillMaxWidth()
        ) {
            Tab(
                selected = selectedRole == "Personal",
                onClick = { selectedRole = "Personal" },
                text = { Text("Personal") }
            )
            Tab(
                selected = selectedRole == "Aluno",
                onClick = { selectedRole = "Aluno" },
                text = { Text("Aluno") }
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        if (selectedRole == "Personal") {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("E-mail") },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentType = ContentType.EmailAddress },
                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) }
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Senha") },
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics {
                        contentType = if (isRegisterMode) ContentType.NewPassword else ContentType.Password
                    },
                visualTransformation = PasswordVisualTransformation(),
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) }
            )

            Spacer(modifier = Modifier.height(24.dp))

            Button(
                onClick = {
                    if (isRegisterMode) viewModel.register(email, password) else viewModel.login(email, password)
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = authState !is AuthState.Loading
            ) {
                if (authState is AuthState.Loading) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text(if (isRegisterMode) "Criar conta" else "Entrar")
                }
            }

            TextButton(
                onClick = { isRegisterMode = !isRegisterMode },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isRegisterMode) "Já tem conta? Entrar" else "Não tem conta? Criar conta")
            }

            if (authState is AuthState.Authenticated && authenticatedRole != UserRole.ADM && authenticatedRole != UserRole.TRAINER) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                    modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
                ) {
                    Text(
                        text = "Login feito, mas esta conta ainda não tem um papel de Personal atribuído " +
                            "(área de Aluno em construção). Peça para um ADM configurar o campo \"role\" " +
                            "desta conta no Firestore.",
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        } else {
            // Área do Aluno (Aviso)
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.padding(16.dp)
            ) {
                Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "🚀 Área em Construção",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "A área do aluno está em desenvolvimento. Em breve você poderá acompanhar seus treinos por aqui!",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }

        if (authState is AuthState.Error) {
            Text(
                text = (authState as AuthState.Error).message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
    }
}
