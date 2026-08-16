package com.example.personalapp.ui.screen

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
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
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity

/** Shared "positive/active/online" indicator color — Material3 has no built-in success role. */
val SuccessGreen = Color(0xFF4CAF50)

@Composable
fun WeightChart(
    biometrics: List<BiometricEntity>,
    modifier: Modifier = Modifier
) {
    val data = biometrics.sortedBy { it.date }
    if (data.size < 2) {
        Box(modifier = modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
            Text(
                "Adicione mais medidas para ver o gráfico",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall
            )
        }
        return
    }

    val maxWeight = data.maxOf { it.weight }.toFloat()
    val minWeight = data.minOf { it.weight }.toFloat()
    val range = (maxWeight - minWeight).coerceAtLeast(1f)
    val primaryColor = MaterialTheme.colorScheme.primary

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
            color = primaryColor,
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )

        points.forEach { point ->
            drawCircle(
                color = primaryColor,
                radius = 5.dp.toPx(),
                center = point
            )
        }
    }
}

@Composable
fun StudentCard(student: UserEntity, onClick: () -> Unit) {
    val isFeminino = student.gender == "Feminino"
    val backgroundColor = if (isFeminino) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.secondaryContainer
    val onBackgroundColor = if (isFeminino) MaterialTheme.colorScheme.onTertiaryContainer else MaterialTheme.colorScheme.onSecondaryContainer

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
                        tint = MaterialTheme.colorScheme.onError
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
                    color = onBackgroundColor
                )
            }
        }
    }
}
