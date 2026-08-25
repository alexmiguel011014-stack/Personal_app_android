package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import dev.gitlive.firebase.firestore.DocumentSnapshot
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Entities are mirrored to/from Firestore as plain maps (GitLive's Map<String, Any?> serializer
// handles this natively — no @Serializable needed, see GOALS.md §18f) so the same nullable-safe
// construction rules apply on both sides. Exercise/PerformedSet lists reuse the exact JSON
// encoding SQLDelight's own ColumnAdapters already use, instead of a second nested-map mapping.
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
    val name = get<String?>("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = get<String?>("role") ?: "student",
        gender = get<String?>("gender") ?: "Masculino",
        phone = get<String?>("phone") ?: "",
        goal = get<String?>("goal") ?: "",
        experienceLevel = get<String?>("experienceLevel") ?: "",
        medicalNotes = get<String?>("medicalNotes") ?: "",
        trainingDays = get<List<String>?>("trainingDays") ?: emptyList(),
        createdAt = get<Long?>("createdAt") ?: 0L,
    )
}

// Maps a linked student's own users/{uid} doc (role stored as "STUDENT", matching AuthRepository's
// convention) into the same UserEntity shape the trainer-side screens already read — role is
// normalized to Room's lowercase convention so it still matches AppDao.getStudents()'s query.
fun DocumentSnapshot.toLinkedUserEntity(): UserEntity? {
    if (get<String?>("role") != "STUDENT") return null
    val name = get<String?>("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = "student",
        gender = get<String?>("gender") ?: "Masculino",
        phone = get<String?>("phone") ?: "",
        goal = get<String?>("goal") ?: "",
        experienceLevel = get<String?>("experienceLevel") ?: "",
        medicalNotes = get<String?>("medicalNotes") ?: "",
        trainingDays = get<List<String>?>("trainingDays") ?: emptyList(),
        createdAt = get<Long?>("createdAt") ?: 0L,
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
    val studentId = get<String?>("studentId") ?: return null
    val name = get<String?>("name") ?: return null
    val exercises = try {
        json.decodeFromString<List<Exercise>>(get<String?>("exercisesJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutEntity(
        id = id,
        studentId = studentId,
        name = name,
        isActive = get<Boolean?>("isActive") ?: true,
        exercises = exercises,
        createdAt = get<Long?>("createdAt") ?: 0L,
        status = get<String?>("status") ?: "draft",
        assignedAt = get<Long?>("assignedAt"),
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
    val studentId = get<String?>("studentId") ?: return null
    return BiometricEntity(
        id = id,
        userId = studentId,
        weight = get<Double?>("weight") ?: 0.0,
        height = get<Double?>("height") ?: 0.0,
        bodyFat = get<Double?>("bodyFat") ?: 0.0,
        date = get<Long?>("date") ?: 0L,
    )
}

fun ScheduleEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "dayOfWeek" to dayOfWeek,
    "hour" to hour,
)

fun DocumentSnapshot.toScheduleEntity(): ScheduleEntity? {
    val studentId = get<String?>("studentId") ?: return null
    return ScheduleEntity(
        id = id,
        studentId = studentId,
        dayOfWeek = get<String?>("dayOfWeek") ?: "",
        hour = get<String?>("hour") ?: "",
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
    val studentId = get<String?>("studentId") ?: return null
    val workoutId = get<String?>("workoutId") ?: return null
    val exerciseName = get<String?>("exerciseName") ?: return null
    val performedSets = try {
        json.decodeFromString<List<PerformedSet>>(get<String?>("performedSetsJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutLogEntity(
        id = id,
        studentId = studentId,
        workoutId = workoutId,
        exerciseName = exerciseName,
        date = get<Long?>("date") ?: 0L,
        performedSets = performedSets,
        note = get<String?>("note"),
    )
}
