package com.example.personalapp.data.repository

import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthRepositoryTest {

    private val auth = mockk<FirebaseAuth>()
    private val firestore = mockk<FirebaseFirestore>()
    private val repository = AuthRepository(auth, firestore)

    private fun stubSignIn(uid: String) {
        val user = mockk<FirebaseUser> { every { this@mockk.uid } returns uid }
        val authResult = mockk<AuthResult> { every { this@mockk.user } returns user }
        every { auth.signInWithEmailAndPassword(any(), any()) } returns Tasks.forResult(authResult)
    }

    private fun stubRoleDoc(uid: String, role: String?) {
        val snapshot = mockk<DocumentSnapshot> { every { getString("role") } returns role }
        val docRef = mockk<DocumentReference> { every { get() } returns Tasks.forResult(snapshot) }
        val collectionRef = mockk<CollectionReference> { every { document(uid) } returns docRef }
        every { firestore.collection("users") } returns collectionRef
    }

    @Test
    fun `login resolves TRAINER role from Firestore`() = runTest {
        stubSignIn("uid-1")
        stubRoleDoc("uid-1", "TRAINER")

        val result = repository.login("trainer@example.com", "pw")

        assertTrue(result.isSuccess)
        assertEquals(UserRole.TRAINER, result.getOrNull())
    }

    @Test
    fun `login resolves role case-insensitively`() = runTest {
        stubSignIn("uid-2")
        stubRoleDoc("uid-2", "adm")

        val result = repository.login("admin@example.com", "pw")

        assertEquals(UserRole.ADM, result.getOrNull())
    }

    @Test
    fun `login defaults to STUDENT when the role field is missing`() = runTest {
        stubSignIn("uid-3")
        stubRoleDoc("uid-3", null)

        val result = repository.login("new@example.com", "pw")

        assertEquals(UserRole.STUDENT, result.getOrNull())
    }

    @Test
    fun `login defaults to STUDENT when the role field is unrecognized`() = runTest {
        stubSignIn("uid-4")
        stubRoleDoc("uid-4", "SOMETHING_ELSE")

        val result = repository.login("weird@example.com", "pw")

        assertEquals(UserRole.STUDENT, result.getOrNull())
    }

    @Test
    fun `login returns failure when sign-in fails`() = runTest {
        every { auth.signInWithEmailAndPassword(any(), any()) } returns
            Tasks.forException(Exception("invalid credentials"))

        val result = repository.login("wrong@example.com", "bad")

        assertTrue(result.isFailure)
    }
}
