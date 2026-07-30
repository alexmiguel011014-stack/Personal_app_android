package com.example.personalapp.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

enum class UserRole {
    ADM, TRAINER, STUDENT, NONE
}

@Singleton
class AuthRepository @Inject constructor(
    private val auth: FirebaseAuth,
    private val firestore: FirebaseFirestore
) {
    suspend fun login(email: String, pass: String): Result<UserRole> {
        return try {
            val result = auth.signInWithEmailAndPassword(email, pass).await()
            val uid = result.user?.uid ?: return Result.failure(Exception("UID não encontrado"))
            
            // Buscar role no Firestore
            val doc = firestore.collection("users").document(uid).get().await()
            val roleStr = doc.getString("role")?.uppercase() ?: "STUDENT"
            
            val role = try {
                UserRole.valueOf(roleStr)
            } catch (e: Exception) {
                UserRole.STUDENT
            }
            
            Result.success(role)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun getCurrentUser() = auth.currentUser

    fun logout() {
        auth.signOut()
    }
}
