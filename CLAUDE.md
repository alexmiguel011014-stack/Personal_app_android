# CLAUDE.md — Personal Tracker (Android)

Conventions that aren't obvious from reading the code alone. See [GOALS.md](GOALS.md) for the
full build plan and current status.

## Role routing

`RoleRouter.kt` is the single entry point after login. It reads `AuthState.Authenticated(role)`
from `AuthViewModel` and branches on `UserRole`:

- `ADM` → `AdminDashboardScreen`
- `TRAINER` → `AppNavigation()` (the full student/workout/schedule nav graph)
- `STUDENT` → currently routed back to `LoginScreen` with a placeholder message — the Student
  role has no screens yet (see GOALS.md §5b). Don't build Student UI without first checking
  whether §5b has landed.

Role comes from `Firestore: users/{uid}.role`, resolved once at login time
(`AuthRepository.login`). A user can never change their own `role` or `trainerId` field —
`firestore.rules` blocks it; only an ADM (or a future Cloud Function, see §7) can write it.

## Data layer: Firestore is the source of truth, Room is the offline cache

This is **not** a local-only Room app. `TrainerRepository` writes to Firestore first (via
`FirestoreMappers.kt`'s entity↔doc mapping, every doc `trainerId`-scoped), and a
`startListening(trainerId)` snapshot listener per collection (`students`, `workouts`,
`biometrics`, `schedules`, `workoutLogs`) mirrors Firestore changes back into Room. Every
screen/ViewModel still reads from Room — always via `Flow`, never a one-shot fetch, so listener
writes show up reactively without a manual reload call.

Practical implications when touching this layer:

- Adding a new synced field/entity means updating three places in lockstep:
  `AppDao` (Room query/entity), `FirestoreMappers.kt` (`toFirestoreMap()` / `toXEntity()`), and
  `TrainerRepository`'s write method (push to Firestore *and* Room).
- `startListening` is called from `AuthViewModel.login()` only when `role == TRAINER`, and
  `stopListening` on logout. If you add a new trainer-scoped collection, register its listener
  there too, or it'll never sync.
- Any Room schema change needs a real `Migration` object registered on `AppDatabase` —
  `exportSchema = true`, schemas committed under `app/schemas/`. `fallbackToDestructiveMigration`
  is kept only as a safety net for paths without an explicit migration, not a substitute for one.
- `HistoryEntity` is intentionally Room-only, not synced to Firestore — it's a legacy concept
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

`GenerativeAiService` (client-side Gemini call, `com.google.ai.client.generativeai` — **this SDK
is deprecated upstream**, see GOALS.md §3) builds one text prompt from the student's profile
fields and asks for a specific JSON shape back. `AIWorkoutViewModel.tryParseWorkouts()` extracts
the first `{...}` block from the raw response (the model sometimes wraps JSON in prose) and
decodes it — if you change the requested JSON shape in the prompt, update `AIWorkoutResponse`/
`AIWorkout`/`AIExercise` in `AIWorkoutViewModel.kt` to match, they're hand-kept in sync, not
generated from a schema.

Reachable today from `StudentDetailsScreen`'s "Ficha Personal" button (dialog: Manual vs. IA) —
*and* from `WorkoutBuilderScreen`'s "Criar Manual"/"Criar com IA" buttons, reached via
`StudentDetailsScreen`'s "Gerenciar" link next to the workout list (that screen also has the
active-workout edit/toggle/delete controls the read-only list on `StudentDetailsScreen` doesn't).
Two entry points to the same two destinations — not a bug, `WorkoutBuilderScreen` is the fuller
management view.
