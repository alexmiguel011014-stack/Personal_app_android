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

## Visual theme (GOALS.md §22)

`shared/src/commonMain/.../ui/theme/AppTheme.kt` is the *one* file for palette and shape —
`MainActivity.kt` wraps `RoleRouter()`/content in `AppTheme { }` instead of a bare
`MaterialTheme { }`. Every screen already reads colors via
`MaterialTheme.colorScheme.*` and radii via `MaterialTheme.shapes.*` (verified by grep — the only
hardcoded color anywhere in `ui/screen` is `SuccessGreen`, a deliberate fill for a role Material3
doesn't have), so a palette/shape change belongs in `AppTheme.kt` alone, not spread across
screens. No dark theme exists yet — out of scope until asked for.

Two gaps `AppTheme.kt`'s `Shapes` does **not** close, so don't assume a future theme edit fixes
them for free:

- **Material3's `Button` ignores the theme's `Shapes` entirely** — it defaults to a fixed pill
  shape regardless of what's passed to `MaterialTheme`. Confirmed empirically on Compose
  Multiplatform 1.11.1 (every other shape token changed on screen; buttons didn't). To get a
  less-rounded button, pass `shape = MaterialTheme.shapes.medium` explicitly at that `Button` call
  site — there is no theme-level switch for it.
- **Elevation → 1dp borders was a stated §22a direction, not implemented.** `AppTheme.kt` defines
  `Outline`/`OutlineVariant` color tokens for this, but no existing `Card` was changed to use a
  border instead of its default elevation.

**The website's look was never a theme problem — don't look for it here.** The old Kotlin/JS web
build painted the entire UI into a single `<canvas>` (confirmed on the live DOM 2026-09-22:
`document.body.innerText` was an empty string), so no palette or corner radius could make it read
as a website — §22 tried exactly that, and the verdict afterwards was still "parece app". The fix
was GOALS.md §23: a separate React/Next front in `web/`, which replaced it (the Kotlin/JS build was
removed at §23l). `AppTheme.kt` themes the Android app only.

## Web front (GOALS.md §23)

`web/` is a Next.js 16 app (App Router, npm), the only website — it replaced the Kotlin/JS web
build, which is gone (no `js` target, no `jsMain`; removed at §23l, 2026-09-28). Phase 1 — every
screen, unstyled — was built (§23d–§23i), went live on GitHub Pages (§23l), and passed the
trainer's validation (§23j, 2026-09-28). The visual pass (§23k) followed, from the trainer's own
ALLU template. `web-ci.yml` checks it on every push and pull request; `web-deploy.yml` publishes
it. Until §23 says otherwise:

- **Styling is one stylesheet, `web/src/app/globals.css`** — the ALLU template's tokens, class
  names and breakpoints (>1050, 861–1050, ≤860 tablet/phone with a bottom tab bar, ≤600, ≤430),
  plus defaults for bare elements. No CSS framework, no component library, no CSS-in-JS. Extend
  the stylesheet (or the shared frames in `src/app/_shared/`: `AppShell`, `PublicShell`) rather
  than adding a stylesheet per screen; keep text ≥12px, controls ≥44px, form fields 16px on
  touch widths, and give every table that has more than three columns `className="stack"` with a
  `data-label` on each `<td>` so it reads as labelled rows on a phone. Behaviour, data and
  `domain/` are not visual concerns: a restyle changes markup around them, not them.
- **The site lives under a sub-path** on Pages (`/Personal_app_android/`): the deploy sets
  `NEXT_PUBLIC_BASE_PATH`, which `next.config.ts` turns into `basePath`. `Link` and the router
  prefix it themselves; any URL built by hand (a `fetch` of a `public/` file, a link meant to be
  shared) must read that variable too — and routes end in `/` (`trailingSlash`).

Two more web conventions (§23f) that differ from Android on purpose:

- **The site is a static export** (`output: "export"`): there is no server in production, and Next
  refuses server features even in `next dev`. Auth and data are the Firebase client SDK in the
  browser; `firestore.rules` is the security. Hence the invite link `/convite/?c=CODE` — a path
  segment unknown at build time would need a server.
- **"Manter conectado" is Firebase persistence, not a preference plus a sign-out.** Checked is
  `browserLocalPersistence`, unchecked is `browserSessionPersistence` (the session ends with the
  tab). That keeps the invariant the Android code protects above — Firebase never holds a session
  the UI pretends isn't there — by construction. Don't port the Android startup sign-out to the web.

Before writing route code in `web/`, read `web/AGENTS.md`: this Next differs from what models
remember (global `PageProps`/`LayoutProps` helpers, `params` as a Promise).

**Layout.** `src/domain/` is pure TypeScript — the model and every derivation, no Firestore, no
clock (every "today" and time zone is an argument) — with a unit test beside each file.
`src/data/` talks to Firestore through the modular SDK; `converters.ts` is the one place a document
becomes a domain type. `src/app/` holds the routes: `/` (landing), `/entrar`, `/convite?c=`, the
trainer's `/app/*` and the student's `/aluno/*`, each area with its own layout and gate
(`RequireArea`); `app/_shared/` has the few pieces both use (the underscore keeps it out of the
routes). `rules/` has the emulator tests — the rules themselves, and the data layer run through
them. `scripts/` seeds the emulators with fake data and copies the ficha prompt's assets.

**The Kotlin side is authoritative.** The phone writes and reads back the same documents, so the web
stores exactly what the Android line in production (`claude/tarefas-abertas-front-9834f6`) stores:
same fields, types, defaults and read leniency. When the two disagree, the web is wrong. A web-only
difference is allowed only when it changes nothing the phone reads — stricter input validation,
trimming, a comma decimal saved with a dot — and each one is commented where it happens and
recorded in GOALS.md §23. Where Kotlin/JVM standard-library behaviour differs from JavaScript's
(whitespace sets, `toIntOrNull`'s 32-bit range, `toDoubleOrNull`'s padding, Java's ASCII-only `\s`,
`trimIndent` after interpolation), `src/domain/kotlin.ts` reproduces the Kotlin side. The hand
ports and their originals (paths under `shared/src/commonMain/kotlin/com/example/personalapp/` on
that branch):

| `web/src/` | Kotlin original |
|---|---|
| `domain/workoutParser.ts` (Smart Paste) | `util/WorkoutParser.kt`; its tests port `WorkoutParserTest.kt` |
| `domain/fichaPrompt.ts` | `PromptFichaViewModel.buildPrompt`; template and volume table are `app/src/main/assets/`, copied by `scripts/copy-prompt-assets.mjs` |
| `data/converters.ts` | `data/repository/FirestoreMappers.kt` (including `fieldOrNull`'s leniency) |
| `domain/exercise.ts` | `data/model/Exercise.kt`, `PerformedSet.kt` (the kotlinx JSON in `exercisesJson`/`performedSetsJson`) |
| `domain/workouts.ts`, `data/workouts.ts` | `TrainerRepository`'s status derivation; `PromptFichaScreen`/`ManualWorkoutScreen` save and paste rules |
| `data/session.ts`, `data/invites.ts` | `AuthRepository.resolveRole` and `RoleRouter`; `AuthRepository.claimInvite` |
| `domain/studentProfile.ts`, `data/students.ts` | `AddStudentScreen`/`EditStudentScreen`; `TrainerRepository`'s user writes |
| `domain/assessments.ts`, `data/assessments.ts` | `AssessmentEntity.kt` (`ParQ.QUESTIONS`); `StudentRepository.submitAssessment` |
| `domain/sessionLog.ts`, `data/workoutLogs.ts` | `StudentLogSessionScreen`; `StudentViewModel.logSession` |
| `domain/biometrics.ts`, `data/biometrics.ts` | `AddBiometricDialog`; `StudentViewModel.logOwnBiometric` |
| `domain/progression.ts` | `ExerciseProgressionChart` |
| `domain/schedules.ts`, `data/schedules.ts` | `ScheduleScreen`; `TrainerViewModel.bookSlot` |

Web-only, with no Kotlin original: mensalidades (`domain/payments.ts`, `domain/billing.ts` — the
trainer decided the phone doesn't show payments) and the dashboard's numbers (`domain/metrics.ts`,
`domain/dashboard.ts`).

**No AI provider key ever reaches the browser** (decided 2026-09-24, GOALS.md §23e): the web builds
the §15 prompt for the trainer to paste into whichever AI app they use, and reads the reply back
with Smart Paste. Direct generation (`GenerativeAiService`, BYO keys, Firebase AI Logic) stays on
Android; a server-side proxy would be its own item (a Cloud Function, which needs the Blaze plan).

Checks, from `web/`: `npm test`, `npm run lint`, `npx tsc --noEmit` (run `npx next typegen` first
on a fresh checkout), `npm run build`, and `npm run test:rules` (emulators, Java 21).

## Security rules (`firestore.rules`)

One Firestore database serves every client (Android, web, iOS), so there is one live rules file —
published by hand by the trainer (console copy-paste, or `firebase deploy --only firestore:rules`
with their own login). **The two KMP lines each carry a copy, and the copies diverged**: GOALS.md
§23d found this branch's copy was an older §17 version with a privilege hole the published one
had already closed. **Since 2026-09-28 the live rules are the copy on `feature/kmp-web`** (the
Android line's `af2b9b0` plus §23d, last changed in `004a029`); the Android branch's copy is behind
it and must not be published — it would drop `payments`/`billingPlans` and reopen §23d's holes.
Never publish a copy without diffing it against what's live.

Every rules change gets a test in `web/rules/firestore.rules.test.ts`, run against the local
emulator with `npm run test:rules` from `web/` (Java 21; see `web/README.md`). `assertFails`
passes on *any* failure, so a new "rejects X" test proves nothing until it's been seen failing
against the old rules: `RULES_FILE=<published copy> npm run test:rules` does exactly that.
