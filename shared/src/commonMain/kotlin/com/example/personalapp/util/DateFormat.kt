package com.example.personalapp.util

import kotlinx.datetime.TimeZone
import kotlinx.datetime.number
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Instant

// Replaces java.text.SimpleDateFormat("dd/MM/yyyy[ HH:mm]", locale) on the trainer screens.
// The patterns are fixed pt-BR-style numeric ones, so the locale the old code threaded through
// only ever affected nothing observable; device time zone is kept.
fun formatDate(epochMillis: Long): String {
    val dt = Instant.fromEpochMilliseconds(epochMillis).toLocalDateTime(TimeZone.currentSystemDefault())
    return "${dt.day.pad()}/${dt.month.number.pad()}/${dt.year}"
}

fun formatDateTime(epochMillis: Long): String {
    val dt = Instant.fromEpochMilliseconds(epochMillis).toLocalDateTime(TimeZone.currentSystemDefault())
    return "${formatDate(epochMillis)} ${dt.hour.pad()}:${dt.minute.pad()}"
}

private fun Int.pad(): String = toString().padStart(2, '0')
