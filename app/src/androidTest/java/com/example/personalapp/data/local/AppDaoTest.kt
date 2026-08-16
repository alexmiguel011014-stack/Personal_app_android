package com.example.personalapp.data.local

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.personalapp.data.local.dao.AppDao
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.ScheduleEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Room CRUD + Flow-emission coverage for §9 of GOALS.md. Needs a device/emulator to run
 * (Room's in-memory database requires a real Android SQLite driver) — not runnable in this
 * sandboxed environment, which has no AVD/emulator set up.
 */
@RunWith(AndroidJUnit4::class)
class AppDaoTest {

    private lateinit var db: AppDatabase
    private lateinit var dao: AppDao

    @Before
    fun createDb() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        dao = db.appDao()
    }

    @After
    fun closeDb() {
        db.close()
    }

    @Test
    fun insertAndReadStudent() = runBlocking {
        val student = UserEntity(
            id = "s1", name = "Ana", role = "student", createdAt = 0L
        )
        dao.insertUser(student)

        assertEquals(student, dao.getUserById("s1"))
        assertTrue(dao.getStudents().first().any { it.id == "s1" })
    }

    @Test
    fun deleteUserById_removesRow() = runBlocking {
        dao.insertUser(UserEntity(id = "s2", name = "Bruno", role = "student", createdAt = 0L))
        dao.deleteUserById("s2")

        assertNull(dao.getUserById("s2"))
    }

    @Test
    fun insertWorkout_appearsInActiveWorkoutsFlow() = runBlocking {
        val workout = WorkoutEntity(
            id = "w1",
            studentId = "s1",
            name = "Treino A",
            isActive = true,
            exercises = listOf(Exercise(name = "Supino", sets = 3, reps = "12")),
            createdAt = 0L
        )
        dao.insertWorkout(workout)

        val active = dao.getActiveWorkoutsByStudent("s1").first()
        assertEquals(1, active.size)
        assertEquals("draft", active[0].status)
    }

    @Test
    fun deleteWorkoutById_removesFromActiveFlow() = runBlocking {
        val workout = WorkoutEntity(
            id = "w2", studentId = "s1", name = "Treino B", isActive = true,
            exercises = emptyList(), createdAt = 0L
        )
        dao.insertWorkout(workout)
        dao.deleteWorkoutById("w2")

        assertTrue(dao.getActiveWorkoutsByStudent("s1").first().isEmpty())
    }

    @Test
    fun insertBiometric_appearsInFlow() = runBlocking {
        val biometric = BiometricEntity(id = "b1", userId = "s1", weight = 80.0, height = 1.8, bodyFat = 15.0, date = 0L)
        dao.insertBiometric(biometric)

        assertEquals(listOf(biometric), dao.getBiometricsByUser("s1").first())
    }

    @Test
    fun insertAndDeleteSchedule() = runBlocking {
        val schedule = ScheduleEntity(id = "sc1", studentId = "s1", dayOfWeek = "Segunda", hour = "08h")
        dao.insertSchedule(schedule)
        assertTrue(dao.getAllSchedules().any { it.id == "sc1" })

        dao.deleteScheduleById("sc1")
        assertTrue(dao.getAllSchedules().none { it.id == "sc1" })
    }

    @Test
    fun workoutLog_roundTripsPerformedSets() = runBlocking {
        val log = WorkoutLogEntity(
            id = "log1",
            studentId = "s1",
            workoutId = "w1",
            exerciseName = "Supino",
            date = 0L,
            performedSets = listOf(PerformedSet(setNumber = 1, weight = "60", reps = 10)),
            note = "boa execução"
        )
        dao.insertWorkoutLog(log)

        val stored = dao.getWorkoutLogsByStudent("s1").first().single()
        assertEquals(log, stored)

        dao.deleteWorkoutLogById("log1")
        assertTrue(dao.getWorkoutLogsByStudent("s1").first().isEmpty())
    }
}
