package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.AssessmentEntity
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

// Entities are mirrored to/from Firestore as plain maps (not Firestore's POJO reflection) so the
// same nullable-safe construction rules apply on both sides. Exercise/PerformedSet lists reuse the
// exact JSON encoding Room's own Converters already use, instead of a second nested-map mapping.
private val json = Json { ignoreUnknownKeys = true }

// GitLive's DocumentSnapshot.get<T>() decodes strictly (a field stored with an unexpected type
// throws), unlike the Android SDK's getString()/getLong() which just returned null. This keeps the
// old lenient "missing or malformed field -> null -> default" behaviour every mapper below relies on.
private inline fun <reified T> DocumentSnapshot.fieldOrNull(name: String): T? =
    try {
        get<T?>(name)
    } catch (e: Exception) {
        null
    }

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
    val name = fieldOrNull<String>("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = fieldOrNull<String>("role") ?: "student",
        gender = fieldOrNull<String>("gender") ?: "Masculino",
        phone = fieldOrNull<String>("phone") ?: "",
        goal = fieldOrNull<String>("goal") ?: "",
        experienceLevel = fieldOrNull<String>("experienceLevel") ?: "",
        medicalNotes = fieldOrNull<String>("medicalNotes") ?: "",
        trainingDays = fieldOrNull<List<String>>("trainingDays") ?: emptyList(),
        createdAt = fieldOrNull<Long>("createdAt") ?: 0L,
    )
}

// Maps a linked student's own users/{uid} doc (role stored as "STUDENT", matching AuthRepository's
// convention) into the same UserEntity shape the trainer-side screens already read — role is
// normalized to Room's lowercase convention so it still matches AppDao.getStudents()'s query.
fun DocumentSnapshot.toLinkedUserEntity(): UserEntity? {
    if (fieldOrNull<String>("role") != "STUDENT") return null
    val name = fieldOrNull<String>("name") ?: return null
    return UserEntity(
        id = id,
        name = name,
        role = "student",
        gender = fieldOrNull<String>("gender") ?: "Masculino",
        phone = fieldOrNull<String>("phone") ?: "",
        goal = fieldOrNull<String>("goal") ?: "",
        experienceLevel = fieldOrNull<String>("experienceLevel") ?: "",
        medicalNotes = fieldOrNull<String>("medicalNotes") ?: "",
        trainingDays = fieldOrNull<List<String>>("trainingDays") ?: emptyList(),
        createdAt = fieldOrNull<Long>("createdAt") ?: 0L,
        linked = true,
        canSelfAssess = fieldOrNull<Boolean>("canSelfAssess") ?: false,
        canLogBiometrics = fieldOrNull<Boolean>("canLogBiometrics") ?: false,
        pendingAssessmentRequest = fieldOrNull<Boolean>("pendingAssessmentRequest") ?: false,
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
    val studentId = fieldOrNull<String>("studentId") ?: return null
    val name = fieldOrNull<String>("name") ?: return null
    val exercises = try {
        json.decodeFromString<List<Exercise>>(fieldOrNull<String>("exercisesJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutEntity(
        id = id,
        studentId = studentId,
        name = name,
        isActive = fieldOrNull<Boolean>("isActive") ?: true,
        exercises = exercises,
        createdAt = fieldOrNull<Long>("createdAt") ?: 0L,
        status = fieldOrNull<String>("status") ?: "draft",
        assignedAt = fieldOrNull<Long>("assignedAt"),
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
    val studentId = fieldOrNull<String>("studentId") ?: return null
    return BiometricEntity(
        id = id,
        userId = studentId,
        weight = fieldOrNull<Double>("weight") ?: 0.0,
        height = fieldOrNull<Double>("height") ?: 0.0,
        bodyFat = fieldOrNull<Double>("bodyFat") ?: 0.0,
        date = fieldOrNull<Long>("date") ?: 0L,
    )
}

fun ScheduleEntity.toFirestoreMap(trainerId: String): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "dayOfWeek" to dayOfWeek,
    "hour" to hour,
)

fun DocumentSnapshot.toScheduleEntity(): ScheduleEntity? {
    val studentId = fieldOrNull<String>("studentId") ?: return null
    return ScheduleEntity(
        id = id,
        studentId = studentId,
        dayOfWeek = fieldOrNull<String>("dayOfWeek") ?: "",
        hour = fieldOrNull<String>("hour") ?: "",
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
    val studentId = fieldOrNull<String>("studentId") ?: return null
    val workoutId = fieldOrNull<String>("workoutId") ?: return null
    val exerciseName = fieldOrNull<String>("exerciseName") ?: return null
    val performedSets = try {
        json.decodeFromString<List<PerformedSet>>(fieldOrNull<String>("performedSetsJson") ?: "[]")
    } catch (e: Exception) {
        emptyList()
    }
    return WorkoutLogEntity(
        id = id,
        studentId = studentId,
        workoutId = workoutId,
        exerciseName = exerciseName,
        date = fieldOrNull<Long>("date") ?: 0L,
        performedSets = performedSets,
        note = fieldOrNull<String>("note"),
    )
}

// GOALS.md §17: assessments/{id}. parQAnswers ride as the same JSON string Room's Converters store,
// like exercisesJson/performedSetsJson; trainingDays as a plain list, like users.trainingDays.
fun AssessmentEntity.toFirestoreMap(): Map<String, Any?> = mapOf(
    "trainerId" to trainerId,
    "studentId" to studentId,
    "submittedAt" to submittedAt,
    "parQAnswersJson" to json.encodeToString(parQAnswers),
    "goal" to goal,
    "experienceLevel" to experienceLevel,
    "trainingDays" to trainingDays,
)

fun DocumentSnapshot.toAssessmentEntity(): AssessmentEntity? {
    val studentId = fieldOrNull<String>("studentId") ?: return null
    val trainerId = fieldOrNull<String>("trainerId") ?: return null
    val parQAnswers = try {
        json.decodeFromString<Map<String, Boolean>>(fieldOrNull<String>("parQAnswersJson") ?: "{}")
    } catch (e: Exception) {
        emptyMap()
    }
    return AssessmentEntity(
        id = id,
        studentId = studentId,
        trainerId = trainerId,
        submittedAt = fieldOrNull<Long>("submittedAt") ?: 0L,
        parQAnswers = parQAnswers,
        goal = fieldOrNull<String>("goal") ?: "",
        experienceLevel = fieldOrNull<String>("experienceLevel") ?: "",
        trainingDays = fieldOrNull<List<String>>("trainingDays") ?: emptyList(),
    )
}
