package com.example.personalapp.ui.screen

import androidx.compose.foundation.clickable
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
import org.koin.compose.viewmodel.koinViewModel
import com.example.personalapp.data.repository.UserRole
import com.example.personalapp.ui.viewmodel.AuthState
import com.example.personalapp.ui.viewmodel.AuthViewModel
import com.example.personalapp.ui.viewmodel.InviteClaimState
import com.example.personalapp.ui.viewmodel.PasswordResetState
import com.example.personalapp.ui.viewmodel.TrainerRequestState

@Composable
fun LoginScreen(
    viewModel: AuthViewModel = koinViewModel()
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var selectedRole by remember { mutableStateOf("Personal") }
    var isRegisterMode by remember { mutableStateOf(false) }

    val authState by viewModel.authState.collectAsState()
    val stayLoggedIn by viewModel.stayLoggedIn.collectAsState()
    val authenticated = authState as? AuthState.Authenticated
    val authenticatedRole = authenticated?.role
    var inviteCode by remember { mutableStateOf("") }
    val inviteClaimState by viewModel.inviteClaimState.collectAsState()
    val passwordResetState by viewModel.passwordResetState.collectAsState()
    val trainerRequestState by viewModel.trainerRequestState.collectAsState()

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

        // Toggle puramente informativo — login/cadastro é o mesmo formulário para
        // Personal e Aluno, o papel (role) é resolvido pelo Firestore após autenticar
        // (ver AuthViewModel.login/register), nunca por essa seleção de aba.
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

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { viewModel.setStayLoggedIn(!stayLoggedIn) },
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = stayLoggedIn, onCheckedChange = viewModel::setStayLoggedIn)
            Text("Manter conectado")
        }

        Spacer(modifier = Modifier.height(16.dp))

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

        if (!isRegisterMode) {
            TextButton(
                onClick = { viewModel.resetPassword(email) },
                modifier = Modifier.fillMaxWidth(),
                enabled = email.isNotBlank() && passwordResetState !is PasswordResetState.Loading
            ) {
                Text("Esqueci minha senha")
            }
            when (passwordResetState) {
                is PasswordResetState.Sent -> Text(
                    text = "E-mail de redefinição enviado.",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall
                )
                is PasswordResetState.Error -> Text(
                    text = (passwordResetState as PasswordResetState.Error).message,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
                else -> {}
            }
        }

        if (authenticatedRole == UserRole.STUDENT) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    if (authenticated.trainerId != null) {
                        Text(
                            text = "Vinculado ao seu personal. A área do aluno chega em breve por aqui.",
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                    } else {
                        Text(
                            text = "Login feito. Insira o código de convite que seu personal te enviou " +
                                "para vincular sua conta.",
                            color = MaterialTheme.colorScheme.onSecondaryContainer
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        OutlinedTextField(
                            value = inviteCode,
                            onValueChange = { inviteCode = it.uppercase() },
                            label = { Text("Código de convite") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = inviteClaimState !is InviteClaimState.Loading
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = { viewModel.claimInvite(inviteCode.trim()) },
                            enabled = inviteCode.isNotBlank() && inviteClaimState !is InviteClaimState.Loading,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (inviteClaimState is InviteClaimState.Loading) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp))
                            } else {
                                Text("Vincular")
                            }
                        }
                        if (inviteClaimState is InviteClaimState.Error) {
                            Text(
                                text = (inviteClaimState as InviteClaimState.Error).message,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(top = 8.dp)
                            )
                        }
                        // Self-service handoff for the "I should be a TRAINER, not a
                        // STUDENT" case: self-registration always starts as STUDENT (no
                        // self-promotion — see GOALS.md §7). This just queues a request the
                        // ADM sees and approves from the Gestão tab (GOALS.md §5e) — approval
                        // itself is still an ADM-only write, this button can't grant TRAINER
                        // on its own.
                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider()
                        Spacer(modifier = Modifier.height(12.dp))
                        when (trainerRequestState) {
                            is TrainerRequestState.Sent -> Text(
                                text = "Solicitação enviada! Assim que o administrador aprovar, saia e entre novamente no app.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSecondaryContainer
                            )
                            else -> {
                                Text(
                                    text = "É personal trainer? Peça acesso ao administrador:",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                OutlinedButton(
                                    onClick = { viewModel.requestTrainerAccess() },
                                    modifier = Modifier.fillMaxWidth(),
                                    enabled = trainerRequestState !is TrainerRequestState.Loading
                                ) {
                                    if (trainerRequestState is TrainerRequestState.Loading) {
                                        CircularProgressIndicator(modifier = Modifier.size(20.dp))
                                    } else {
                                        Text("Solicitar acesso de Trainer")
                                    }
                                }
                                if (trainerRequestState is TrainerRequestState.Error) {
                                    Text(
                                        text = (trainerRequestState as TrainerRequestState.Error).message,
                                        color = MaterialTheme.colorScheme.error,
                                        style = MaterialTheme.typography.bodySmall,
                                        modifier = Modifier.padding(top = 8.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } else if (authState is AuthState.Authenticated && authenticatedRole == UserRole.NONE) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                modifier = Modifier.fillMaxWidth().padding(top = 16.dp)
            ) {
                Text(
                    text = "Login feito, mas esta conta ainda não tem um papel atribuído. " +
                        "Peça para um ADM configurar o campo \"role\" desta conta no Firestore.",
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.padding(16.dp)
                )
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
