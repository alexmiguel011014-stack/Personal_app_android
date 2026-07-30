package com.example.personalapp.ui.screen

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
import java.util.Locale

@Composable
fun WeightChart(
    biometrics: List<BiometricEntity>,
    modifier: Modifier = Modifier
) {
    val data = biometrics.sortedBy { it.date }
    if (data.size < 2) {
        Box(modifier = modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
            Text("Adicione mais medidas para ver o gráfico", color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
        return
    }

    val maxWeight = data.maxOf { it.weight }.toFloat()
    val minWeight = data.minOf { it.weight }.toFloat()
    val range = (maxWeight - minWeight).coerceAtLeast(1f)

    Canvas(modifier = modifier.fillMaxWidth().height(150.dp).padding(horizontal = 32.dp, vertical = 16.dp)) {
        val width = size.width
        val height = size.height
        val spaceX = width / (data.size - 1)

        val points = data.mapIndexed { index, biometric ->
            val x = index * spaceX
            val y = height - ((biometric.weight.toFloat() - minWeight) / range) * height
            androidx.compose.ui.geometry.Offset(x, y)
        }

        val path = Path().apply {
            moveTo(points.first().x, points.first().y)
            points.forEach { lineTo(it.x, it.y) }
        }

        drawPath(
            path = path,
            color = Color(0xFF2196F3),
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )

        points.forEach { point ->
            drawCircle(
                color = Color(0xFF2196F3),
                radius = 5.dp.toPx(),
                center = point
            )
        }
    }
}

@Composable
fun StudentCard(student: UserEntity, onClick: () -> Unit) {
    val backgroundColor = if (student.gender == "Feminino") {
        Color(0xFFFFE1F0) // Rosa claro
    } else {
        Color(0xFFE3F2FD) // Azul claro
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(100.dp)
            .clickable { onClick() },
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            // Marcador de Observação Médica
            if (student.medicalNotes.isNotBlank()) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp),
                    color = MaterialTheme.colorScheme.error,
                    shape = MaterialTheme.shapes.small
                ) {
                    Icon(
                        Icons.Default.Warning,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp).padding(2.dp),
                        tint = Color.White
                    )
                }
            }

            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = student.name,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = Color.Black
                )
            }
        }
    }
}

@Composable
fun DayAgendaItem(day: String) {
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
            Text(
                text = day,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            
            AnimatedVisibility(visible = expanded) {
                Column {
                    Spacer(modifier = Modifier.height(8.dp))
                    hours.forEach { hour ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(text = hour, fontSize = 14.sp, color = Color.Gray)
                            IconButton(onClick = { /* Agendar */ }, modifier = Modifier.size(24.dp)) {
                                Icon(Icons.Default.Add, contentDescription = "Agendar", tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        if (hour != "21h") HorizontalDivider(thickness = 0.5.dp, color = Color.LightGray)
                    }
                }
            }
        }
    }
}
