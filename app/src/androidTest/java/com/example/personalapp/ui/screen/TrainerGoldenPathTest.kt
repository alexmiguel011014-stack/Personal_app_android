package com.example.personalapp.ui.screen

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.example.personalapp.data.local.entity.BiometricEntity
import com.example.personalapp.data.local.entity.UserEntity
import com.example.personalapp.data.local.entity.WorkoutEntity
import com.example.personalapp.data.local.entity.WorkoutLogEntity
import com.example.personalapp.data.model.Exercise
import com.example.personalapp.data.model.PerformedSet
import com.example.personalapp.data.repository.StudentRepository
import com.example.personalapp.data.repository.TrainerRepository
import com.example.personalapp.ui.viewmodel.StudentDetailsViewModel
import com.example.personalapp.ui.viewmodel.StudentViewModel
import com.example.personalapp.ui.viewmodel.WorkoutViewModel
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Covers GOALS.md §9's "at least the Trainer golden path": a trainer assigns a workout, the
 * student logs a session against it, and the trainer's own screen reflects that update. Repositories
 * are mocked with MockK, backed by [MutableStateFlow]s that the stubs mutate — an in-memory stand-in
 * for Firestore's realtime listeners, so the test exercises real ViewModel/Compose reactivity
 * without a live backend or device network access.
 *
 * Needs a device/emulator to run (Compose UI tests execute on-device) — not runnable in this
 * sandboxed environment (no AVD set up here), same caveat as [com.example.personalapp.data.local.AppDaoTest].
 */
@RunWith(AndroidJUnit4::class)
class TrainerGoldenPathTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val studentId = "student-1"
    private val trainerId = "trainer-1"
    private val workoutId = "workout-1"

    @Test
    fun assigningWorkout_studentLogsSession_trainerSeesUpdate() {
        val seedWorkout = WorkoutEntity(
            id = workoutId,
            studentId = studentId,
            name = "Treino A",
            isActive = false,
            exercises = listOf(Exercise(name = "Supino", sets = 3, reps = "12")),
            createdAt = 0L,
            status = "draft",
        )
        val workoutsFlow = MutableStateFlow(listOf(seedWorkout))
        val logsFlow = MutableStateFlow<List<WorkoutLogEntity>>(emptyList())

        val trainerRepository = mockk<TrainerRepository>()
        every { trainerRepository.getActiveWorkoutsByStudent(studentId) } returns workoutsFlow
        every { trainerRepository.getWorkoutLogsByStudent(studentId) } returns logsFlow
        every { trainerRepository.getBiometricsByUser(studentId) } returns MutableStateFlow<List<BiometricEntity>>(emptyList())
        coEvery { trainerRepository.getUserById(studentId) } returns
            UserEntity(id = studentId, name = "Ana", role = "student", createdAt = 0L)
        coEvery { trainerRepository.updateWorkout(any()) } answers {
            // Mirrors the real fix in TrainerRepository: isActive drives status/assignedAt.
            val updated = firstArg<WorkoutEntity>()
            val withStatus = if (updated.isActive) {
                updated.copy(status = "assigned", assignedAt = 1L)
            } else {
                updated.copy(status = "draft", assignedAt = null)
            }
            workoutsFlow.value = workoutsFlow.value.map { if (it.id == withStatus.id) withStatus else it }
        }
        coEvery { trainerRepository.insertWorkoutLog(any(), any()) } answers {
            logsFlow.value = logsFlow.value + firstArg<WorkoutLogEntity>()
        }

        val studentRepository = mockk<StudentRepository>()
        coEvery { studentRepository.logSession(any(), any()) } coAnswers {
            trainerRepository.insertWorkoutLog(firstArg(), secondArg())
        }

        val workoutViewModel = WorkoutViewModel(trainerRepository)
        val studentDetailsViewModel = StudentDetailsViewModel(trainerRepository)
        val studentViewModel = StudentViewModel(studentRepository)

        // Step 1: trainer opens the workout builder and assigns the (currently draft) workout.
        composeTestRule.setContent {
            MaterialTheme {
                WorkoutBuilderScreen(studentId = studentId, onBack = {}, viewModel = workoutViewModel)
            }
        }
        composeTestRule.runOnIdle { workoutViewModel.loadWorkouts(studentId) }
        composeTestRule.onNodeWithText("Inativo").assertExists()

        composeTestRule.onNodeWithContentDescription("Status").performClick()
        composeTestRule.waitForIdle()

        assertEquals("assigned", workoutsFlow.value.single().status)
        composeTestRule.onNodeWithText("Ativo").assertExists()

        // Step 2: the student logs a session against that now-assigned workout.
        studentViewModel.start(studentId, trainerId)
        studentViewModel.logSession(
            workoutId,
            mapOf("Supino" to listOf(PerformedSet(setNumber = 1, weight = "60", reps = 10))),
        )
        composeTestRule.waitForIdle()
        assertEquals(1, logsFlow.value.size)

        // Step 3: the trainer reopens the student's screen and sees the logged session.
        composeTestRule.setContent {
            MaterialTheme {
                StudentDetailsScreen(
                    studentId = studentId,
                    onBack = {},
                    onNavigateToManual = {},
                    onNavigateToAI = {},
                    onNavigateToEdit = {},
                    onNavigateToWorkoutBuilder = {},
                    onNavigateToPromptFicha = {},
                    viewModel = studentDetailsViewModel,
                )
            }
        }
        composeTestRule.runOnIdle { studentDetailsViewModel.loadStudent(studentId) }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Supino").assertExists()
        composeTestRule.onNodeWithText("Nenhuma sessão registrada pelo aluno ainda.").assertDoesNotExist()
    }
}
