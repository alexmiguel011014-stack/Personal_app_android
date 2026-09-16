package com.example.personalapp.data.repository

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

// Replaces the old MockK-based AuthRepositoryTest (GOALS.md §18f/§18l): the role-resolution
// rules it asserted are now a pure function, so they run on every target with no SDK mocking.
class AuthResultResolutionTest {

    @Test
    fun `resolves TRAINER role`() {
        assertEquals(UserRole.TRAINER, resolveAuthResult("TRAINER", null).role)
    }

    @Test
    fun `resolves role case-insensitively`() {
        assertEquals(UserRole.ADM, resolveAuthResult("adm", null).role)
    }

    @Test
    fun `defaults to STUDENT when the role field is missing`() {
        assertEquals(UserRole.STUDENT, resolveAuthResult(null, null).role)
    }

    @Test
    fun `defaults to STUDENT when the role field is unrecognized`() {
        assertEquals(UserRole.STUDENT, resolveAuthResult("SOMETHING_ELSE", null).role)
    }

    @Test
    fun `passes trainerId through for a linked student`() {
        val result = resolveAuthResult("STUDENT", "trainer-42")
        assertEquals(UserRole.STUDENT, result.role)
        assertEquals("trainer-42", result.trainerId)
    }

    @Test
    fun `trainerId stays null when absent`() {
        assertNull(resolveAuthResult("TRAINER", null).trainerId)
    }
}
