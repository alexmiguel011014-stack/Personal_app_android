package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import com.google.firebase.firestore.DocumentSnapshot
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Entities are mirrored to/from Firestore as plain maps (not Firestore's POJO reflection) so the
// same nullable-safe construction rules apply on both sides. Exercise/PerformedSet lists reuse the
// exact JSON encoding Room's own Converters already use, instead of a second nested-map mapping.
private val json = Json { ignoreUnknownKeys = true }

fun UserEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "name" to name,
    "role" to role,
    "gender" to gender,
    "phone" to phone,
    "goal" to goal,
    "experienceLevel" to experienceLevel,
    "medicalNotes" to medicalNotes,
    "trainingDays" to trainingDays,
    "createdAt" to createdAt,
)

fun DocumentSnapshot.toUserEntity(): UserEntity? {
    val name = getString("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = getString("role") ?: "student",
        gender = getString("gender") ?: "Masculino",
        phone = getString("phone") ?: "",
        goal = getString("goal") ?: "",
        experienceLevel = getString("experienceLevel") ?: "",
        medicalNotes = getString("medicalNotes") ?: "",
        trainingDays = (get("trainingDays") as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
        createdAt = getLong("createdAt") ?: 0L,
    )
}

// Maps a linked student's own users/{uid} doc (role stored as "STUDENT", matching AuthRepository's
// convention) into the same UserEntity shape the trainer-side screens already read — role is
// normalized to Room's lowercase convention so it still matches AppDao.getStudents()'s query.
fun DocumentSnapshot.toLinkedUserEntity(): UserEntity? {
    if (getString("role") != "STUDENT") return null
    val name = getString("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = "student",
        gender = getString("gender") ?: "Masculino",
        phone = getString("phone") ?: "",
        goal = getString("goal") ?: "",
        experienceLevel = getString("experienceLevel") ?: "",
        medicalNotes = getString("medicalNotes") ?: "",
        trainingDays = (get("trainingDays") as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
        createdAt = getLong("createdAt") ?: 0L,
        linked = true,
    )
}

// Update-only payload for a linked student's users/{uid} doc: never includes role/trainerId, so a
// trainer edit can't trip the immutability check in firestore.rules' users/{uid} update rule.
fun UserEntity.toLinkedStudentUpdateMap(): Map<String, Any?> = mapOf(
    "name" to name,
    "gender" to gender,
    "phone" to phone,
    "goal" to goal,
    "experienceLevel" to experienceLevel,
    "medicalNotes" to medicalNotes,
    "trainingDays" to trainingDays,
)

fun WorkoutEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "name" to name,
    "isActive" to isActive,
    "exercisesJson" to json.encodeToString(exercises),
    "createdAt" to createdAt,
    "status" to status,
    "assignedAt" to assignedAt,
)

fun DocumentSnapshot.toWorkoutEntity(): WorkoutEntity? {
    val studentId = getString("studentId") ?: return null
    val name = getString("name") ?: return null
    val exercises = try {
        json.decodeFromString<List<Exercise>>(getString("exercisesJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutEntity(
        id = id,
        studentId = studentId,
        name = name,
        isActive = getBoolean("isActive") ?: true,
        exercises = exercises,
        createdAt = getLong("createdAt") ?: 0L,
        status = getString("status") ?: "draft",
        assignedAt = getLong("assignedAt"),
    )
}

fun BiometricEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to userId,
    "weight" to weight,
    "height" to height,
    "bodyFat" to bodyFat,
    "date" to date,
)

fun DocumentSnapshot.toBiometricEntity(): BiometricEntity? {
    val studentId = getString("studentId") ?: return null
    return BiometricEntity(
        id = id,
        userId = studentId,
        weight = getDouble("weight") ?: 0.0,
        height = getDouble("height") ?: 0.0,
        bodyFat = getDouble("bodyFat") ?: 0.0,
        date = getLong("date") ?: 0L,
    )
}

fun ScheduleEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "dayOfWeek" to dayOfWeek,
    "hour" to hour,
)

fun DocumentSnapshot.toScheduleEntity(): ScheduleEntity? {
    val studentId = getString("studentId") ?: return null
    return ScheduleEntity(
        id = id,
        studentId = studentId,
        dayOfWeek = getString("dayOfWeek") ?: "",
        hour = getString("hour") ?: "",
    )
}

fun WorkoutLogEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "workoutId" to workoutId,
    "exerciseName" to exerciseName,
    "date" to date,
    "performedSetsJson" to json.encodeToString(performedSets),
    "note" to note,
)

fun DocumentSnapshot.toWorkoutLogEntity(): WorkoutLogEntity? {
    val studentId = getString("studentId") ?: return null
    val workoutId = getString("workoutId") ?: return null
    val exerciseName = getString("exerciseName") ?: return null
    val performedSets = try {
        json.decodeFromString<List<PerformedSet>>(getString("performedSetsJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutLogEntity(
        id = id,
        studentId = studentId,
        workoutId = workoutId,
        exerciseName = exerciseName,
        date = getLong("date") ?: 0L,
        performedSets = performedSets,
        note = getString("note"),
    )
}
