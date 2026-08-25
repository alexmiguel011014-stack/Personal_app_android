package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import dev.gitlive.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

// Read path for the Student's own screens (GOALS.md §5b). Unlike TrainerRepository, this reads
// straight from Firestore instead of through Room: the student's device never runs
// TrainerRepository.startListening (that mirrors a *trainer's* whole roster), so Room would just
// be empty here. Writes reuse TrainerRepository.insertWorkoutLog, which already takes trainerId
// as a parameter instead of reading it from auth — it was built for exactly this caller.
class StudentRepository(
    private val firestore: FirebaseFirestore,
    private val trainerRepository: TrainerRepository,
) {
    fun getMyWorkouts(studentId: String): Flow<List<WorkoutEntity>> =
        firestore.collection("workouts")
            .where { ("studentId" equalTo studentId) and ("status" equalTo "assigned") }
            .snapshots
            .map { snapshot -> snapshot.documents.mapNotNull { it.toWorkoutEntity() } }

    fun getMyBiometrics(studentId: String): Flow<List<BiometricEntity>> =
        firestore.collection("biometrics")
            .where { "studentId" equalTo studentId }
            .snapshots
            .map { snapshot -> snapshot.documents.mapNotNull { it.toBiometricEntity() } }

    fun getMyWorkoutLogs(studentId: String): Flow<List<WorkoutLogEntity>> =
        firestore.collection("workoutLogs")
            .where { "studentId" equalTo studentId }
            .snapshots
            .map { snapshot -> snapshot.documents.mapNotNull { it.toWorkoutLogEntity() } }

    suspend fun logSession(log: WorkoutLogEntity, trainerId: String) =
        trainerRepository.insertWorkoutLog(log, trainerId)
}
