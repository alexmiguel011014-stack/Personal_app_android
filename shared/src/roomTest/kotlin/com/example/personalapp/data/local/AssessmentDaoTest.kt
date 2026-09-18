package com.example.personalapp.data.local

import androidx.room3.Room
import androidx.sqlite.driver.bundled.BundledSQLiteDriver
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.AssessmentEntity
import com.example.personalapp.data.local.entity.UserEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

// GOALS.md §17f: the assessments table + the three new users columns, on the same in-memory
// BundledSQLiteDriver setup as AppDaoTest (and the same "device or iOS simulator only" caveat).
class AssessmentDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var dao: AppDao

    @BeforeTest
    fun createDb() {
        db = Room.inMemoryDatabaseBuilder<AppDatabase>()
            .setDriver(BundledSQLiteDriver())
            .build()
        dao = db.appDao()
    }

    @AfterTest
    fun closeDb() {
        db.close()
    }

    @Test
    fun assessment_roundTripsParQAnswersAndSnapshot() = runBlocking {
        val assessment = AssessmentEntity(
            id = "a1",
            studentId = "s1",
            trainerId = "t1",
            submittedAt = 1_000L,
            parQAnswers = mapOf("heart_condition" to false, "dizziness" to true),
            goal = "Hipertrofia",
            experienceLevel = "Intermediário",
            trainingDays = listOf("Segunda", "Quarta"),
        )
        dao.insertAssessment(assessment)

        val stored = dao.getAssessmentsByStudent("s1").first().single()
        assertEquals(assessment, stored)
        assertEquals(listOf("dizziness"), stored.flaggedQuestions().map { it.key })
    }

    @Test
    fun assessments_areOrderedNewestFirst() = runBlocking {
        val base = AssessmentEntity("x", "s1", "t1", 0L, emptyMap(), "", "", emptyList())
        dao.insertAssessment(base.copy(id = "old", submittedAt = 10L))
        dao.insertAssessment(base.copy(id = "new", submittedAt = 20L))

        assertEquals(listOf("new", "old"), dao.getAssessmentsByStudent("s1").first().map { it.id })
    }

    @Test
    fun deleteAssessmentById_removesRow() = runBlocking {
        dao.insertAssessment(AssessmentEntity("a2", "s1", "t1", 0L, emptyMap(), "", "", emptyList()))
        dao.deleteAssessmentById("a2")

        assertTrue(dao.getAssessmentsByStudent("s1").first().isEmpty())
    }

    @Test
    fun userPermissionFlags_roundTripAndObserve() = runBlocking {
        val student = UserEntity(id = "s1", name = "Ana", role = "student", createdAt = 0L, linked = true)
        dao.insertUser(student)
        assertEquals(false, dao.observeUserById("s1").first()?.canSelfAssess)

        dao.updateUser(student.copy(canSelfAssess = true, canLogBiometrics = true, pendingAssessmentRequest = true))

        val updated = dao.observeUserById("s1").first()
        assertEquals(true, updated?.canSelfAssess)
        assertEquals(true, updated?.canLogBiometrics)
        assertEquals(true, updated?.pendingAssessmentRequest)
    }
}
