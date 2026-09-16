package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.crashlytics.crashlytics
import dev.gitlive.firebase.firestore.DocumentSnapshot
import dev.gitlive.firebase.firestore.FirebaseFirestore
import dev.gitlive.firebase.firestore.Query
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
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
            .where { all("studentId" equalTo studentId, "status" equalTo "assigned") }
            .live(DocumentSnapshot::toWorkoutEntity)

    fun getMyBiometrics(studentId: String): Flow<List<BiometricEntity>> =
        firestore.collection("biometrics")
            .where { "studentId" equalTo studentId }
            .live(DocumentSnapshot::toBiometricEntity)

    fun getMyWorkoutLogs(studentId: String): Flow<List<WorkoutLogEntity>> =
        firestore.collection("workoutLogs")
            .where { "studentId" equalTo studentId }
            .live(DocumentSnapshot::toWorkoutLogEntity)

    suspend fun logSession(log: WorkoutLogEntity, trainerId: String) =
        trainerRepository.insertWorkoutLog(log, trainerId)

    // A listener error (e.g. PERMISSION_DENIED) used to surface as an empty list and stay silent;
    // same empty-list result here, but recorded to Crashlytics like TrainerRepository's mirrors.
    private fun <T> Query.live(map: (DocumentSnapshot) -> T?): Flow<List<T>> = snapshots
        .map { snapshot -> snapshot.documents.mapNotNull(map) }
        .catch {
            Firebase.crashlytics.recordException(it)
            emit(emptyList())
        }
}
