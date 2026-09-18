<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §9 elsewhere in GOALS.md point here. -->

## 9. Testing
- [x] Real coverage added (placeholders `ExampleUnitTest`/`ExampleInstrumentedTest` left in place,
      harmless):
      1. `WorkoutParserTest` (`app/src/test/.../util/`) — 8 cases, name/exercise parsing including
         the reps-first heuristic, multi-line input, blank/non-matching lines. **Ran, all pass.**
      2. `AuthRepositoryTest` (`app/src/test/.../data/repository/`) — 5 cases, role resolution
         (TRAINER/ADM, case-insensitive), default-to-STUDENT on missing/unrecognized role,
         sign-in failure → `Result.failure`. Mocks `FirebaseAuth`/`FirebaseFirestore` with MockK +
         `Tasks.forResult`/`forException` (added `mockk`, `kotlinx-coroutines-test` as test-only
         deps). **Ran, all pass.**
      3. `AppDaoTest` (`app/src/androidTest/.../data/local/`) — Room in-memory CRUD + Flow
         emissions for students, workouts (incl. new `status` default), biometrics, schedules.
         **Written and compiles clean** (`compileDebugAndroidTestKotlin`), but Room's in-memory
         builder needs a real Android SQLite driver — **not runnable in this environment** (no
         AVD/emulator set up here); needs a device/emulator or CI matrix to actually execute.
      4. `workoutLog_roundTripsPerformedSets` (same file) — covers the `workoutLogs` round-trip
         item explicitly. Same caveat: written, compiles, not run.
- [x] Compose UI test (instrumented) for the Trainer golden path: `TrainerGoldenPathTest.kt`
      (`app/src/androidTest/.../ui/screen/`) — trainer assigns a workout (toggles Ativo in
      `WorkoutBuilderScreen`), student logs a session (`StudentViewModel.logSession`), trainer's
      `StudentDetailsScreen` reflects the new log. Real `WorkoutViewModel`/`StudentDetailsViewModel`/
      `StudentViewModel` driven through their actual Compose screens; `TrainerRepository`/
      `StudentRepository` are MockK fakes backed by `MutableStateFlow`s the stubs mutate, standing
      in for Firestore's realtime listeners — no live backend needed. Added
      `androidx.compose.ui:ui-test-junit4`/`ui-test-manifest` + `mockk-android` as androidTest-only
      deps for this. **Ran `compileDebugAndroidTestKotlin`, compiles clean** — same caveat as
      `AppDaoTest`: Compose UI tests execute on-device, not runnable in this sandboxed environment
      (no AVD/emulator here). **Writing this test surfaced a real bug**, now fixed: `WorkoutEntity.status`
      (what `StudentRepository` queries for `"assigned"`) was a dead field — only `isActive` was
      ever toggled by the UI, so no student would ever have seen an assigned workout. Fixed in
      `TrainerRepository.insertWorkout`/`updateWorkout` (see §6).
- [x] Single command that runs everything device-independent: `./gradlew verify` (registered in
      `app/build.gradle.kts`, depends on `testDebugUnitTest` + `lint`). `connectedAndroidTest` is
      deliberately excluded — it needs a device/emulator, kept as its own explicit stage
      (see §11). Ran, green.
