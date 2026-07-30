package com.example.personalapp.data.local

import androidx.room.TypeConverter
import com.example.personalapp.data.model.Exercise
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class Converters {
    @TypeConverter
    fun fromExerciseList(value: List<Exercise>): String {
        return Json.encodeToString(value)
    }

    @TypeConverter
    fun toExerciseList(value: String): List<Exercise> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }

    @TypeConverter
    fun fromStringList(value: List<String>): String {
        return Json.encodeToString(value)
    }

    @TypeConverter
    fun toStringList(value: String): List<String> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }
}
