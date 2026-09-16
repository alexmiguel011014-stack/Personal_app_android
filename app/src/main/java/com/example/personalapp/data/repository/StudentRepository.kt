package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

// Read path for the Student's own screens (GOALS.md §5b). Unlike TrainerRepository, this reads
// straight from Firestore instead of through Room: the student's device never runs
// TrainerRepository.startListening (that mirrors a *trainer's* whole roster), so Room would just
// be empty here. Writes reuse TrainerRepository.insertWorkoutLog, which already takes trainerId
// as a parameter instead of reading it from auth — it was built for exactly this caller.
class StudentRepository(
    private val firestore: FirebaseFirestore,
    private val trainerRepository: TrainerRepository,
) {
    fun getMyWorkouts(studentId: String): Flow<List<WorkoutEntity>> = callbackFlow {
        val registration = firestore.collection("workouts")
            .whereEqualTo("studentId", studentId)
            .whereEqualTo("status", "assigned")
            .addSnapshotListener { snapshot, _ ->
                trySend(snapshot?.documents?.mapNotNull { it.toWorkoutEntity() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    fun getMyBiometrics(studentId: String): Flow<List<BiometricEntity>> = callbackFlow {
        val registration = firestore.collection("biometrics")
            .whereEqualTo("studentId", studentId)
            .addSnapshotListener { snapshot, _ ->
                trySend(snapshot?.documents?.mapNotNull { it.toBiometricEntity() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    fun getMyWorkoutLogs(studentId: String): Flow<List<WorkoutLogEntity>> = callbackFlow {
        val registration = firestore.collection("workoutLogs")
            .whereEqualTo("studentId", studentId)
            .addSnapshotListener { snapshot, _ ->
                trySend(snapshot?.documents?.mapNotNull { it.toWorkoutLogEntity() } ?: emptyList())
            }
        awaitClose { registration.remove() }
    }

    suspend fun logSession(log: WorkoutLogEntity, trainerId: String) =
        trainerRepository.insertWorkoutLog(log, trainerId)
}
