package com.example.personalapp.data.repository

import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
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

    // GOALS.md §17e: StudentNavigation reads canSelfAssess/canLogBiometrics/pendingAssessmentRequest
    // from this live listener (no new sync mechanism — same doc AuthRepository resolves at login,
    // just kept reactive here) to conditionally show the corresponding tab/action.
    fun getMyProfile(studentId: String): Flow<UserEntity?> =
        firestore.collection("users").document(studentId).snapshots
            .map { it.toLinkedUserEntity() }

    // Writes the assessment doc and clears the pending-request flag. Two separate writes, not one
    // transaction — firestore.rules only requires each write to independently satisfy its own
    // rule (canSelfAssess == true for the create; the narrow true->false exception for the
    // update), not that they land atomically together.
    suspend fun submitAssessment(assessment: AssessmentEntity) {
        firestore.collection("assessments").document(assessment.id).set(assessment.toFirestoreMap())
        firestore.collection("users").document(assessment.studentId).updateFields { "pendingAssessmentRequest" to false }
    }

    // Gated by the caller checking canLogBiometrics first (StudentLogBiometricScreen) — the real
    // gate is firestore.rules' matching create exception, this is just the write path.
    suspend fun logOwnBiometric(entry: BiometricEntity, trainerId: String) {
        firestore.collection("biometrics").document(entry.id).set(entry.toFirestoreMap(trainerId))
    }
}
