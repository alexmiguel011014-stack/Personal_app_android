# CLAUDE.md — Personal Tracker (Kotlin Multiplatform: Android + iOS)

Conventions that aren't obvious from reading the code alone. See [GOALS.md](GOALS.md) for the
full build plan and current status.

## Module shape: `:shared` holds the app, `:app` is the Android host

As of GOALS.md §18 (the KMP migration), almost everything lives in
`shared/src/commonMain/kotlin/com/example/personalapp/` — data models, repositories, the
SQLDelight database, ViewModels, every screen Composable, navigation. `:app` (the classic
`app/src/main/java/...` tree) is now down to three files: `MainActivity.kt` (hosts
`RoleRouter()` inside a `Surface`), `MainApplication.kt` (Koin `startKoin{}` + App Check install),
and `di/AppModule.kt` (the Koin module — stays in `:app` because it needs `androidContext()`,
which only exists on the Android side). Package names didn't change when files moved to
`shared/commonMain`, so imports elsewhere are unaffected by where a file physically lives.

Platform-specific code that can't be common (Firebase AI Logic for Gemini, the
share-sheet/open-URL actions, `SettingsDataStore`'s storage backend, the SQLDelight driver
factory, `currentTimeMillis()`) follows one convention throughout: an `expect` declaration in
`shared/src/commonMain`, with `.android.kt`/`.ios.kt` `actual` files in
`shared/src/androidMain`/`shared/src/iosMain`. Grep for `expect fun`/`expect class` in
`commonMain` to find every one of these seams.

There is no iOS *app* yet — only `:shared`'s Kotlin/Native framework, verified by compiling (not
running) on GitHub Actions' macOS runner (`.github/workflows/ios-ci.yml`, free on this public
repo). This dev machine cannot compile Kotlin/Native's Apple targets at all; that CI workflow is
the only way iOS-side Kotlin code gets verified. A few native-linking items are tracked as open
in GOALS.md §18f/§18g/§18j (they need either CocoaPods integration or an actual Xcode project,
neither of which exists yet) — check there before assuming an iOS-side feature is wired end to
end.

## Role routing

`RoleRouter.kt` is the single entry point after login. It reads `AuthState.Authenticated(role)`
from `AuthViewModel` and branches on `UserRole`:

- `ADM` → `AdminDashboardScreen`
- `TRAINER` → `AppNavigation()` (the full student/workout/schedule nav graph)
- `STUDENT` → `StudentNavigation()` (the student's own read-mostly nav graph: workouts,
  biometrics, log-session, evolution) once they've claimed a trainer invite (`trainerId != null`
  and `currentUid()` resolves); otherwise falls through to `LoginScreen` (covers an
  authenticated-but-unclaimed student, same as Idle/Loading/Error).

Also renders a dismissible update-check banner above whatever the role-based `when` picks
(`UpdateViewModel`/`UpdateChecker`, GOALS.md §18i) — checked once per session via
`LaunchedEffect(Unit)`, not per screen.

Role comes from `Firestore: users/{uid}.role`, resolved once at login time
(`AuthRepository.login`). A user can never change their own `role` or `trainerId` field —
`firestore.rules` blocks it; only an ADM (or a future Cloud Function, see §7) can write it.

**"Manter conectado" (stay logged in)**: Firebase itself always persists its own session across
app restarts, independent of anything this app does — `auth.currentUser` comes back non-null on
a fresh launch whether or not the person asked to stay signed in. This app's own opt-in
preference (`SettingsRepository.stayLoggedIn`, a `DataStore` boolean defaulting to `false`)
controls whether `AuthViewModel.checkCurrentUser()` *acts* on that persisted session: if true, it
re-resolves the role via `AuthRepository.resolveCurrentSession()` and routes straight in; if
false, it calls `repository.logout()` — a real `auth.signOut()` — so the two don't silently
disagree. Don't "simplify" this by skipping the sign-out call on the false path; that would leave
Firebase's session alive while the UI pretends there isn't one.

## Data layer: Firestore is the source of truth, SQLDelight is the offline cache

This is **not** a local-only app. `TrainerRepository` writes to Firestore first (via
`FirestoreMappers.kt`'s entity↔doc mapping, every doc `trainerId`-scoped, using GitLive's
Kotlin Multiplatform Firebase SDK — see GOALS.md §18f, not the classic `com.google.firebase.*`
Android SDK), and a `startListening(trainerId)` snapshot listener per collection (`students`,
`workouts`, `biometrics`, `schedules`, `workoutLogs`) mirrors Firestore changes back into the
local SQLDelight database via `Flow<QuerySnapshot>`, not callback-based listeners. Every
screen/ViewModel still reads from the local DB — always via `Flow`, never a one-shot fetch, so
listener writes show up reactively without a manual reload call.

Practical implications when touching this layer:

- Adding a new synced field/entity means updating three places in lockstep: the relevant `.sq`
  file under `shared/src/commonMain/sqldelight/.../data/local/` (SQLDelight generates the
  `Queries` object + row type from this), `FirestoreMappers.kt` (`toFirestoreMap()` / `toXEntity()`,
  using `DocumentSnapshot.get<T?>()` — GitLive has no `getString`/`getBoolean`-style typed
  getters), and `TrainerRepository`'s write method (push to Firestore *and* the local DB).
- `startListening` is called from `AuthViewModel.login()` only when `role == TRAINER`, and
  `stopListening` on logout. If you add a new trainer-scoped collection, register its listener
  there too, or it'll never sync.
- Any SQLDelight schema change is just editing the `.sq` file directly — this project's
  `sqldelight { databases { create("AppDatabase") { ... } } }` block (`shared/build.gradle.kts`)
  does **not** have migration verification wired up (no `.sqm` migration files, no
  `verifyMigrations`), so unlike Room there's no build-time safety net catching a
  backward-incompatible change. `shared/schemas/` holds Room's old JSON schema exports from
  before the §18d migration, kept only as historical reference for what the shape used to
  be — SQLDelight doesn't read them. Since this app has no real users on old schema versions
  yet, that gap hasn't mattered; revisit before there's real data to lose.
- `HistoryEntity` is intentionally local-only, not synced to Firestore — it's a legacy concept
  superseded by `WorkoutLogEntity`/`workoutLogs` (see GOALS.md Product goal #3). Don't wire it
  into Firestore sync; if it's ever going to carry real data again, replace it with `workoutLogs`
  instead.

## "Smart Paste" workout import format

`WorkoutParser.kt` turns pasted free-text into a workout name + exercise list, used by the
AI-workout screen's paste box and any future manual-import UI. Two independent regexes:

- **Name**: first line matching `(Ficha|Treino|Dia)\s+[A-Ga-g1-7]` (case-insensitive), e.g.
  `"Ficha A"`, `"treino b"`, `"Dia 1"`.
- **Exercises**: each line matching `(.+?)\s+(\d+)\s*[xX]\s*([\d-]+)` — exercise name, then a
  `NxM` or `N x M-M` pattern. The parser decides which number is sets vs. reps by picking
  whichever is the *smaller* of the two (sets are assumed low, ≤10ish); this means both
  `"Supino 3x12"` (sets-first) and `"Biceps 12x4"` (reps-first, exactly the shape a trainer
  might paste from a WhatsApp message) parse to the same sets/reps meaning. Don't "fix" this
  into an int-comparison bug — it's deliberate, see `WorkoutParserTest` for the exact cases this
  covers.
- Lines that don't match either pattern (blank lines, free-text notes) are silently skipped, not
  errors — that's intentional, pasted text is expected to be messy.

## AI workout generation

`GenerativeAiService` (`shared/commonMain`) builds one text prompt from the student's profile
fields and dispatches it to one of four providers (`AiProvider` enum). Gemini goes through a
`GeminiProvider` interface injected per platform (GOALS.md §18f) — `AndroidGeminiProvider` calls
Firebase AI Logic (`com.google.firebase:firebase-ai`, the Gemini Developer API backend, no
client-side API key), `IosGeminiProvider` is an honest "not available on iOS yet" stub, since
Firebase AI Logic has no official Kotlin Multiplatform/iOS SDK. OpenAI/DeepSeek/Claude are plain
HTTP through Ktor Client and work identically on both platforms — DeepSeek reuses OpenAI's exact
request path since its API is OpenAI-wire-format-compatible; Claude is not (different auth
header, different response shape, see the code comments). `AIWorkoutViewModel.tryParseWorkouts()`
extracts the first `{...}` block from the raw response (the model sometimes wraps JSON in prose)
and decodes it — if you change the requested JSON shape in the prompt, update
`AIWorkoutResponse`/`AIWorkout`/`AIExercise` (`shared/commonMain/.../data/model/AIWorkoutModels.kt`)
to match, they're hand-kept in sync, not generated from a schema.

Reachable today from `StudentDetailsScreen`'s "Ficha Personal" button (dialog: Manual vs. IA) —
*and* from `WorkoutBuilderScreen`'s "Criar Manual"/"Criar com IA" buttons, reached via
`StudentDetailsScreen`'s "Gerenciar" link next to the workout list (that screen also has the
active-workout edit/toggle/delete controls the read-only list on `StudentDetailsScreen` doesn't).
Two entry points to the same two destinations — not a bug, `WorkoutBuilderScreen` is the fuller
management view.
