package com.example.personalapp.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.ui.viewmodel.TrainerViewModel
import java.util.Locale

@Composable
fun ScheduleScreen(
    viewModel: TrainerViewModel = hiltViewModel()
) {
    val students by viewModel.students.collectAsState()
    val schedules by viewModel.schedules.collectAsState()
    val selectedStudentId by viewModel.selectedStudentId.collectAsState()
    val daysOfWeek = listOf("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo")

    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            text = "Agendar Treino",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.padding(16.dp)
        )

        // Seletor de Alunos para agendamento
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(students) { student ->
                val isSelected = selectedStudentId == student.id
                Card(
                    modifier = Modifier
                        .width(100.dp)
                        .height(60.dp)
                        .clickable { 
                            viewModel.selectStudent(if (isSelected) null else student.id) 
                        },
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) 
                            MaterialTheme.colorScheme.primary 
                        else 
                            MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = student.name,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 16.dp)
        ) {
            items(daysOfWeek) { day ->
                DayAgendaItem(
                    day = day,
                    schedules = schedules.filter { it.dayOfWeek == day },
                    students = students,
                    onBookSlot = { hour -> viewModel.bookSlot(day, hour) }
                )
            }
        }
    }
}

@Composable
fun DayAgendaItem(
    day: String,
    schedules: List<ScheduleEntity>,
    students: List<UserEntity>,
    onBookSlot: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(value = false) }
    val hours = (6..21).map { String.format(Locale.ROOT, "%02dh", it) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .clickable { expanded = !expanded },
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = day,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                if (schedules.isNotEmpty()) {
                    Badge { Text("${schedules.size} agendados") }
                }
            }
            
            AnimatedVisibility(visible = expanded) {
                Column {
                    Spacer(modifier = Modifier.height(8.dp))
                    hours.forEach { hour ->
                        val appointment = schedules.find { it.hour == hour }
                        val student = students.find { it.id == appointment?.studentId }

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(text = hour, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (student != null) {
                                    Text(
                                        text = student.name,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            
                            if (student == null) {
                                IconButton(onClick = { onBookSlot(hour) }, modifier = Modifier.size(24.dp)) {
                                    Icon(Icons.Default.Add, contentDescription = "Agendar", tint = MaterialTheme.colorScheme.primary)
                                }
                            } else {
                                Icon(
                                    Icons.Default.CheckCircle,
                                    contentDescription = "Ocupado",
                                    tint = SuccessGreen,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                        if (hour != "21h") HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
            }
        }
    }
}
