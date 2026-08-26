package com.example.personalapp.data.local

import app.cash.sqldelight.ColumnAdapter
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// GOALS.md §18d: SQLDelight's equivalent of Room's @TypeConverter — one adapter per custom
// column type, wired into the generated AppDatabase constructor (see AppDao.kt).
private val json = Json { ignoreUnknownKeys = true }

val stringListAdapter = object : ColumnAdapter<List<String>, String> {
    override fun decode(databaseValue: String): List<String> =
        if (databaseValue.isEmpty()) emptyList() else json.decodeFromString(databaseValue)

    override fun encode(value: List<String>): String = json.encodeToString(value)
}

val exerciseListAdapter = object : ColumnAdapter<List<Exercise>, String> {
    override fun decode(databaseValue: String): List<Exercise> =
        if (databaseValue.isEmpty()) emptyList() else json.decodeFromString(databaseValue)

    override fun encode(value: List<Exercise>): String = json.encodeToString(value)
}

val performedSetListAdapter = object : ColumnAdapter<List<PerformedSet>, String> {
    override fun decode(databaseValue: String): List<PerformedSet> =
        if (databaseValue.isEmpty()) emptyList() else json.decodeFromString(databaseValue)

    override fun encode(value: List<PerformedSet>): String = json.encodeToString(value)
}

// GOALS.md §17: PAR-Q answers (question key -> yes/no).
val stringBooleanMapAdapter = object : ColumnAdapter<Map<String, Boolean>, String> {
    override fun decode(databaseValue: String): Map<String, Boolean> =
        if (databaseValue.isEmpty()) emptyMap() else json.decodeFromString(databaseValue)

    override fun encode(value: Map<String, Boolean>): String = json.encodeToString(value)
}
