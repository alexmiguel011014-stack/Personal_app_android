# CLAUDE.md — Personal Tracker (Kotlin Multiplatform: Android now, iOS paused)

Conventions that aren't obvious from reading the code alone. See [GOALS.md](GOALS.md) for the
full build plan and current status (§18 is the KMP migration this layout comes from).

## Module shape (GOALS.md §18)

- **`:shared`** is the app. `commonMain` holds everything: data models, Room database + DAO,
  DataStore, the Firestore/Auth repositories, `GenerativeAiService`, `UpdateChecker`, every
  ViewModel, every Compose screen, navigation, and the `App()` root (`ui/App.kt`).
  `androidMain`/`iosMain` hold only platform file-path builders, the platform Koin module, a
  handful of `expect`/`actual`s (share sheet, Gemini, app version), and iOS's
  `MainViewController()`/`initKoin()`.
- **`:app`** is a thin Android shell: `MainActivity` (`setContent { App() }`), `MainApplication`
  (`startKoin { androidContext(...); modules(platformModule, sharedModule) }` + App Check
  provider install), the manifest, `google-services.json`, signing. Don't add screens, ViewModels
  or repositories here — they go in `:shared`. Its only Kotlin tests are instrumented
  (`TrainerGoldenPathTest`, Android-only on purpose, see §18l).
- Same package names everywhere (`com.example.personalapp.*`) — a file moving between modules
  never changes its imports.
- **iOS is paused (user decision, 2026-09-17)** — don't pick up iOS-only GOALS.md items unless
  told it's resumed. Targets stay declared so `commonMain` keeps compiling for both:
  `iosArm64` + `iosSimulatorArm64` only. `iosX64` was dropped deliberately (androidx.room3 /
  androidx.sqlite publish no variant for it); don't add it back. Nothing iOS has been run or
  even linked yet from this repo — this Windows dev machine can't build Kotlin/Native Apple
  targets; `.github/workflows/ios-ci.yml` is the only iOS check, and the GitLive Firebase actuals
  still need the Firebase iOS SDK linked (CocoaPods/SPM, a macOS step — GOALS.md §18f/§18j).
- JVM target is **17** in both modules (the GitLive SDK ships JVM-17 bytecode and is mostly
  `inline`); Room is **`androidx.room3`** (a package/artifact fork of Room 2.x — `@ColumnTypeConverter`,
  `Migration.migrate(connection: SQLiteConnection)` is `suspend`, `room3 { }` Gradle DSL), and
  Firebase is the **GitLive** KMP SDK (`dev.gitlive.firebase.*`), not `com.google.firebase.*`,
  except in `:app`'s `MainApplication` (App Check) and `:shared`'s Android-only Gemini actual.

## Verification commands

- `./gradlew verify assembleDebug` — the one gate: `:app` unit tests + lint, `:shared`'s
  `commonTest` suite on the JVM (`:shared:testAndroidHostTest`), and *compilation* of both
  instrumented test sets (`:app:compileDebugAndroidTestKotlin`,
  `:shared:compileAndroidDeviceTest`), then the APK. `android-ci.yml` runs the same `verify`.
- `src/roomTest/kotlin` (Room round trips) only compiles for a device. **Never put those tests
  in `commonTest`**: the Android variant of
  `androidx.sqlite:sqlite-bundled` has no JVM-host native library, so they fail there with
  `UnsatisfiedLinkError`. `src/roomTest/kotlin` is added as a source *directory* to both
  `androidDeviceTest` and `iosTest` (not via `dependsOn` — explicit `dependsOn` edges make KGP
  skip the default hierarchy template, which disconnects `iosMain`).
- No device/emulator is set up in this environment; anything instrumented or iOS is "compiles,
  not run" unless GOALS.md says otherwise.

## Role routing

`RoleRouter.kt` is the single entry point after login. It reads `AuthState.Authenticated(role,
trainerId)` from `AuthViewModel` and branches on `UserRole`:

- `ADM` → `AdminDashboardScreen`
- `TRAINER` → `AppNavigation()` (the full student/workout/schedule nav graph)
- `STUDENT` with a `trainerId` → `StudentNavigation()` (Treinos / Evolução); without one →
  `LoginScreen`'s invite-code claim UI (GOALS.md §7).

Role comes from `Firestore: users/{uid}.role`, resolved once at login time
(`AuthRepository.login` → the pure `resolveAuthResult()`). A user can never change their own
`role` or `trainerId` — `firestore.rules` blocks it; only an ADM can write it (or the one-time
invite claim, §7/§13d). `firestore.rules` is deployed by hand from the Console; after editing it,
read the *live* rules back to confirm (§13d's lesson).

## Data layer: Firestore is the source of truth, Room is the offline cache

This is **not** a local-only Room app. `TrainerRepository` writes to Firestore first (via
`FirestoreMappers.kt`'s plain-map entity↔doc mapping, every doc `trainerId`-scoped), and
`startListening(trainerId)` collects one GitLive `Query.snapshots` `Flow` per collection
(`students`, `workouts`, `biometrics`, `schedules`, `workoutLogs`, plus linked students in
`users`) into a `Job` that mirrors changes back into Room; `stopListening` cancels them. Every
trainer screen/ViewModel reads from Room — always via `Flow`, never a one-shot fetch.
`StudentRepository` (the student's own screens) reads Firestore directly, since a student's
device never runs the trainer mirror.

Practical implications when touching this layer:

- Adding a new synced field/entity means updating three places in lockstep:
  `AppDao` (Room), `FirestoreMappers.kt` (`toFirestoreMap()` / `toXEntity()` — reads go through
  `fieldOrNull<T>()`, which keeps GitLive's strict `get<T>()` lenient the way the old Android SDK
  getters were), and `TrainerRepository`'s write method (push to Firestore *and* Room).
- `startListening` is called from `AuthViewModel.login()` only when `role == TRAINER`, and
  `stopListening` on logout. A new trainer-scoped collection must be registered there too, or
  it'll never sync.
- Any Room schema change needs a real `Migration` object registered in `getRoomDatabase()`
  (`AppDatabase.kt`) — `exportSchema = true`, schemas committed under **`shared/schemas/`**.
  `fallbackToDestructiveMigration` is kept only as a safety net for paths without an explicit
  migration, not a substitute for one. The Android database file location and name
  (`personal_app_database` via `Context.getDatabasePath`) and the DataStore path
  (`filesDir/datastore/settings.preferences_pb`, also hardcoded in `app/src/main/res/xml`'s
  backup-exclusion rules) are load-bearing for existing installs — don't rename them.
- `HistoryEntity` is intentionally Room-only, not synced to Firestore — it's a legacy concept
  superseded by `WorkoutLogEntity`/`workoutLogs` (see GOALS.md Product goal #3). Don't wire it
  into Firestore sync.
- `WorkoutEntity.status`/`assignedAt` are *derived* from `isActive` inside
  `TrainerRepository.insertWorkout`/`updateWorkout` — never set them from a screen.

## "Smart Paste" workout import format

`WorkoutParser.kt` turns pasted free-text into a workout name + exercise list, used by the
manual-workout screen's paste box and the §15 prompt-and-paste flow. Two independent regexes:

- **Name**: first line matching `(Ficha|Treino|Dia)\s+[A-Ga-g1-7]` (case-insensitive), e.g.
  `"Ficha A"`, `"treino b"`, `"Dia 1"`.
- **Exercises**: each line matching `(.+?)\s+(\d+)\s*[xX]\s*([\d-]+)` — exercise name, then a
  `NxM` or `N x M-M` pattern. The parser decides which number is sets vs. reps by picking
  whichever is the *smaller* of the two (sets are assumed low, ≤10ish); this means both
  `"Supino 3x12"` (sets-first) and `"Biceps 12x4"` (reps-first, exactly the shape a trainer
  might paste from a WhatsApp message) parse to the same sets/reps meaning. Don't "fix" this
  into an int-comparison bug — it's deliberate, see `WorkoutParserTest` for the exact cases this
  covers.
- An optional trailing `[Muscle:0.75, ...]` annotation per line becomes
  `Exercise.muscleActivation` (period decimals only — a comma is the entry separator).
- Lines that don't match (blank lines, free-text notes) are silently skipped, not errors —
  pasted text is expected to be messy.

## AI workout generation

`GenerativeAiService` (`commonMain`) builds one text prompt from the student's profile plus the
bundled hypertrophy volume table (`composeResources/files/`, read once via `PromptAssets`) and
asks for a specific JSON shape back. Providers: OpenAI (default), DeepSeek, Claude — all BYO-key
from Settings, all plain HTTPS through the shared Ktor `HttpClient` — and Gemini via Firebase AI
Logic, which is `expect`/`actual`: real on Android, a clear "not available" message on iOS (no
KMP wrapper exists). Gemini is deliberately *last* in the UI and never the default (its free tier
is unreliable, GOALS.md §14a). `AIWorkoutViewModel.tryParseWorkouts()` extracts the first
`{...}` block from the raw response and decodes it — if you change the requested JSON shape in
the prompt, update `AIWorkoutResponse`/`AIWorkout`/`AIExercise` (`ui/viewmodel/AIWorkoutModels.kt`)
to match; they're hand-kept in sync, not generated from a schema.

Reachable from `StudentDetailsScreen`'s "Ficha Personal" dialog *and* from `WorkoutBuilderScreen`
(reached via the "Gerenciar" link), each offering in-app AI or the copy-a-prompt flow
(`PromptFichaScreen`). Two entry points to the same destinations — not a bug,
`WorkoutBuilderScreen` is the fuller management view (edit/toggle/delete).

## Releasing a build

Sideload only — no store (GOALS.md §11). Bump `versionCode`/`versionName` in
`app/build.gradle.kts`, `./gradlew assembleRelease` (signing config comes from the gitignored
`local.properties`), attach `app-release.apk` to a GitHub Release, then edit `latest.json` on
`main` to match: the in-app `UpdateChecker` (§18i) reads that raw file on launch and from
Settings → Atualização. For iOS, `ios.signatureExpiresAt` in the same file drives the
"assinatura expira em N dias" banner.
