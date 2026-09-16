package com.example.personalapp.data.local

import androidx.room3.ColumnTypeConverter
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class Converters {
    @ColumnTypeConverter
    fun fromExerciseList(value: List<Exercise>): String {
        return Json.encodeToString(value)
    }

    @ColumnTypeConverter
    fun toExerciseList(value: String): List<Exercise> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }

    @ColumnTypeConverter
    fun fromPerformedSetList(value: List<PerformedSet>): String {
        return Json.encodeToString(value)
    }

    @ColumnTypeConverter
    fun toPerformedSetList(value: String): List<PerformedSet> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }

    @ColumnTypeConverter
    fun fromStringList(value: List<String>): String {
        return Json.encodeToString(value)
    }

    @ColumnTypeConverter
    fun toStringList(value: String): List<String> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }
}
