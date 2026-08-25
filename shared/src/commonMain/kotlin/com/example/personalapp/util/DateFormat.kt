package com.example.personalapp.util

import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.ExperimentalTime
import kotlin.time.Instant

// GOALS.md §18h: replaces java.text.SimpleDateFormat, which doesn't exist on Kotlin/Native.
// The call sites here only ever use fixed numeric patterns ("dd/MM/yyyy[ HH:mm]") — no month
// names or locale-varying text — so a manual zero-padded formatter is exactly as correct as
// SimpleDateFormat(pattern, locale) was, without needing any locale at all.
private fun Int.pad2() = toString().padStart(2, '0')

@OptIn(ExperimentalTime::class)
fun formatDate(epochMillis: Long): String {
    val dt = Instant.fromEpochMilliseconds(epochMillis).toLocalDateTime(TimeZone.currentSystemDefault())
    return "${dt.day.pad2()}/${dt.monthNumber.pad2()}/${dt.year}"
}

@OptIn(ExperimentalTime::class)
fun formatDateTime(epochMillis: Long): String {
    val dt = Instant.fromEpochMilliseconds(epochMillis).toLocalDateTime(TimeZone.currentSystemDefault())
    return "${dt.day.pad2()}/${dt.monthNumber.pad2()}/${dt.year} ${dt.hour.pad2()}:${dt.minute.pad2()}"
}
