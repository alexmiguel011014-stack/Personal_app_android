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
import com.example.personalapp.data.local.entity.WorkoutLogEntity

/** Shared "positive/active/online" indicator color — Material3 has no built-in success role. */
val SuccessGreen = Color(0xFF4CAF50)

// Generic (timestamp, value) line chart — WeightChart and the exercise-load progression chart
// (GOALS.md §5c) are both thin wrappers over this, so the drawing logic exists once.
@Composable
fun LineChart(
    points: List<Pair<Long, Float>>,
    modifier: Modifier = Modifier,
    emptyMessage: String = "Sem dados suficientes para o gráfico"
) {
    val data = points.sortedBy { it.first }
    if (data.size < 2) {
        Box(modifier = modifier.fillMaxWidth().height(150.dp), contentAlignment = Alignment.Center) {
            Text(
                emptyMessage,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall
            )
        }
        return
    }

    val maxValue = data.maxOf { it.second }
    val minValue = data.minOf { it.second }
    val range = (maxValue - minValue).coerceAtLeast(1f)
    val primaryColor = MaterialTheme.colorScheme.primary

    Canvas(modifier = modifier.fillMaxWidth().height(150.dp).padding(horizontal = 32.dp, vertical = 16.dp)) {
        val width = size.width
        val height = size.height
        val spaceX = width / (data.size - 1)

        val offsets = data.mapIndexed { index, (_, value) ->
            val x = index * spaceX
            val y = height - ((value - minValue) / range) * height
            androidx.compose.ui.geometry.Offset(x, y)
        }

        val path = Path().apply {
            moveTo(offsets.first().x, offsets.first().y)
            offsets.forEach { lineTo(it.x, it.y) }
        }

        drawPath(
            path = path,
            color = primaryColor,
            style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
        )

        offsets.forEach { point ->
            drawCircle(
                color = primaryColor,
                radius = 5.dp.toPx(),
                center = point
            )
        }
    }
}

@Composable
fun WeightChart(
    biometrics: List<BiometricEntity>,
    modifier: Modifier = Modifier
) {
    LineChart(
        points = biometrics.map { it.date to it.weight.toFloat() },
        modifier = modifier,
        emptyMessage = "Adicione mais medidas para ver o gráfico"
    )
}

// Exercise picker + load-progression LineChart, shared by the Trainer's "recent activity"
// section (GOALS.md §5c) and the Student's own evolution screen (§5b) — same chart, different
// source of workoutLogs (Room-mirrored for the trainer, read straight from Firestore for the
// student).
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExerciseProgressionChart(workoutLogs: List<WorkoutLogEntity>, modifier: Modifier = Modifier) {
    val exerciseNames = remember(workoutLogs) { workoutLogs.map { it.exerciseName }.distinct().sorted() }
    var selectedExercise by remember(exerciseNames) { mutableStateOf(exerciseNames.firstOrNull()) }
    var dropdownExpanded by remember { mutableStateOf(false) }

    if (exerciseNames.isEmpty()) {
        Text(
            "Nenhuma sessão registrada ainda.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = modifier
        )
        return
    }

    Column(modifier = modifier) {
        ExposedDropdownMenuBox(expanded = dropdownExpanded, onExpandedChange = { dropdownExpanded = it }) {
            OutlinedTextField(
                value = selectedExercise ?: "",
                onValueChange = {},
                readOnly = true,
                label = { Text("Exercício") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = dropdownExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable)
            )
            ExposedDropdownMenu(expanded = dropdownExpanded, onDismissRequest = { dropdownExpanded = false }) {
                exerciseNames.forEach { name ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = { selectedExercise = name; dropdownExpanded = false }
                    )
                }
            }
        }
        Card(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            val points = workoutLogs
                .filter { it.exerciseName == selectedExercise }
                .mapNotNull { log ->
                    val maxWeight = log.performedSets.mapNotNull { it.weight.toFloatOrNull() }.maxOrNull()
                    maxWeight?.let { log.date to it }
                }
            LineChart(points = points, emptyMessage = "Sem sessões registradas para este exercício ainda")
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
