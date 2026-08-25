# GOALS.md — Personal Tracker (Android)

Master plan for the Personal Tracker app: native Android (Kotlin + Jetpack Compose) for
Personal Trainers to manage students, workouts, schedule and AI-generated training plans.

This file is the input for a future `/buildproject` execution pass. It reflects the **real
current state** of the codebase (read directly from source on 2026-08-15), not a greenfield
plan — items already implemented are checked off; everything else is what remains.

Stack (already chosen, in use): Kotlin, Jetpack Compose (Material 3), Room, Hilt, Navigation
Compose, DataStore, Firebase (Auth + Firestore), Google Generative AI SDK (Gemini), Clean
Architecture / MVVM. `compileSdk`/`targetSdk` = 37, `minSdk` = 24, AGP 9.3.1, Kotlin 2.3.20.

---

## Product goal (defined 2026-08-15, via `/newgoal`)

The app connects a Personal Trainer and their Students in one place, end to end:

1. The Trainer builds a workout plan ("ficha") for a student — manually or AI-assisted
   (already built, see §5) — and **assigns it to that student's account** (not built yet).
2. The Student has their **own login**, connected to their Trainer, and can see the ficha(s)
   assigned to them (not built yet — this is the entire missing "Student role", §4/§5).
3. When the Student trains, they **log what they actually lifted** (weight/reps performed per
   exercise, per session — "atualização de carga") back through the app. This is new: today
   the data model only stores the *planned* exercise (`Exercise` in `WorkoutEntity`) and a
   single `intensity` rating per session (`HistoryEntity`) — there is no record of actual
   performed weight/reps anywhere. A new "workout log" concept is required (§4).
4. The Trainer can see and **manage a per-student evolution report**: body metrics
   (weight/height/body fat — the `BiometricEntity` chart already exists, see §5) *plus* strength
   progression per exercise over time (new, depends on #3).
5. The UI should read as a finished, professional product, not a scaffold — see the concrete UI
   debt catalogued in §5.
6. Every pre-existing feature (student CRUD, manual/AI workout builder, schedule, settings)
   should be brought up to the same "professional and functional" bar — see the concrete gaps
   flagged inline in §5 and §9, not just the new features above.

This goal supersedes the earlier framing of §4 as "an open decision" — the Firestore migration
is now a confirmed requirement, not optional, because the Student login/sync flow directly
depends on it.

---

## 0. Toolchain / local setup
- [x] JDK 17 installed (Temurin, via winget).
- [x] Android `platform-tools` (adb) installed.
- [x] **Android SDK Platform 37 + matching build-tools installed** — `platforms;android-37.0` +
      `build-tools;37.0.0` installed via `sdkmanager`, `local.properties` created pointing at
      the project-local `android-sdk/` (the system `ANDROID_HOME` pointed at a nonexistent path).
- [x] `app/google-services.json` — created via Firebase Console, placed at `app/google-services.json`
      (`package_name` verified to match `com.example.personalapp`). `./gradlew assembleDebug`
      confirmed green (`processDebugGoogleServices` passes).
- [x] Firebase project confirmed working: Auth (Email/Password) enabled and Firestore Database
      created — both verified live via unauthenticated Identity Toolkit / Firestore REST probes
      (`INVALID_LOGIN_CREDENTIALS` and `403 PERMISSION_DENIED` respectively, not
      `CONFIGURATION_NOT_FOUND` / 404).

## 1. Project identity
- [x] `README.md` exists and accurately describes the app, stack and setup steps.
- [x] `CLAUDE.md` added at the project root: role-routing model (`RoleRouter.kt`), the
      Firestore-source-of-truth + Room-cache data layer (updated to match the §4a migration, not
      the old "local-only" description), the Smart Paste parsing heuristic (`WorkoutParser.kt`),
      and the AI-workout entry points (now two, see the `WorkoutBuilderScreen` finding above).
- [x] **Module documentation strategy (decided 2026-08-17):** don't add a separate `docs/` tree
      that will drift from the code — keep `CLAUDE.md` for cross-cutting conventions (routing,
      data-layer shape, parsing quirks) and add a short KDoc block (`/** ... */`) directly on
      classes whose *purpose* isn't obvious from their name/members alone. Done: `TrainerRepository`
      (Firestore-as-source-of-truth explanation), `FirestoreMappers.kt` (why plain maps, not POJO
      reflection), `WorkoutParser` (sets-vs-reps heuristic, moved from a code comment to a proper
      doc comment), `AdminViewModel` (why it reads Firestore directly instead of going through
      `TrainerRepository`). `AppLogger` never ended up existing — §5e's Logs tab was built directly
      on Firebase Crashlytics instead, so that part of the original item is moot.

## 2. Version control
- [x] Git repository, remote configured (`github.com/alexmiguel011014-stack/Personal_app_android`) —
      the local folder had no `.git` at all until this session (the outer `sites/` monorepo
      deliberately excludes this project via its own `.gitignore`); initialized locally, synced
      onto the existing remote history via `git reset --soft`, dedicated SSH key added, pushed.
- [x] `.gitignore` covers build artifacts, `.idea` noise, `google-services.json`, and (as of this
      session) `android-sdk/`, `graphify-out/`, `repomix-output.xml`.
- [x] No secret committed (`google-services.json` and API keys are correctly gitignored/never
      hardcoded — keys are user-entered at runtime, see §8 for why that itself is a risk).

## 3. Backend (Firebase + planned AI proxy)
- [x] Firebase Auth wired for email/password login (`AuthRepository.login`).
- [x] Role read from `Firestore: users/{uid}.role` on login (`ADM`/`TRAINER`/`STUDENT`).
- [x] **Decision reversed 2026-08-18** (superseding the same-day decision above to keep
      per-trainer keys): the user chose to stay on Firebase's free Spark plan rather than upgrade
      to Blaze, which rules out the Cloud Function proxy entirely (Cloud Functions can't deploy on
      Spark at any usage level, zero or not). Within that constraint, migrated Gemini to the
      **Firebase AI Logic SDK** (`com.google.firebase:firebase-ai`, Gemini Developer API backend)
      instead — free on Spark, officially maintained (replaces the deprecated
      `com.google.ai.client.generativeai`), and fixes the original raw-client-key security concern
      (unrestricted/standard Gemini keys being retired by Google through Sept 2026) because there
      is no client-held key anymore: `Firebase.ai(backend = GenerativeBackend.googleAI())` calls
      are authenticated via the project's own Firebase config + App Check (already wired, §8),
      not a key typed into Settings. Traded away "each trainer brings their own Gemini key" — the
      app now uses one Gemini configuration for the whole project, managed by the app owner in the
      Firebase Console, not per-trainer. **OpenAI is unaffected and still per-trainer** (raw HTTP
      call, no Firebase billing involved) — kept in Settings as the opt-in "bring your own key"
      alternative for trainers who want it, so the product still offers a BYO-key path, just not
      for Gemini specifically. Implemented in `GenerativeAiService.kt`
      (`generateWithGemini()`), `SettingsRepository`/`SettingsViewModel`/`SettingsScreen.kt`
      (Gemini key field removed), `AdminViewModel`/`AdminDashboardScreen.kt` (Gemini status row is
      now a static "always on" indicator, not a per-device key check). Removed the deprecated SDK
      dependency and its now-orphaned version catalog entries. Verified via
      `./gradlew compileDebugKotlin verify` (all green). **New manual step, only doable by the
      user**: enable Gemini access for the project in Firebase Console → Build → AI Logic → Get
      started → choose "Gemini Developer API" (free) — the SDK call will fail at runtime until
      that's done, same category as the two other pending manual Console steps (publish
      `firestore.rules`, enable App Check enforcement — see §8).
- [x] Gemini model id updated: `gemini-1.5-pro` → `gemini-3.7-flash` (current stable as of
      2026-08-18; verify against https://firebase.google.com/docs/ai-logic/models before relying
      on it long-term, Google sunsets model ids on a rolling schedule).
- [x] `com.google.ai.client.generativeai` (deprecated SDK) removed entirely, replaced by the
      Firebase AI Logic SDK per the decision above.

## 4. Database — Firestore sync + new workout-log model

**4a. Firestore as source of truth (confirmed requirement — see Product goal)**
- [x] Room local DB (`AppDatabase`, v5) with entities: `UserEntity`, `BiometricEntity`,
      `WorkoutEntity`, `HistoryEntity`, `ScheduleEntity`. Full CRUD via `AppDao`/`TrainerRepository`.
- [x] `TrainerRepository` migrated: every write (students/workouts/biometrics/schedules/workoutLogs)
      goes to Firestore (`FirestoreMappers.kt` entity↔doc mapping) in addition to Room; a
      `startListening(trainerId)` snapshot listener per collection mirrors Firestore changes back
      into Room (upsert on ADDED/MODIFIED, delete on REMOVED); every screen still reads Room, now
      via `Flow` end-to-end (`getBiometricsByUser`/`getActiveWorkoutsByStudent` converted from
      one-shot suspend calls so the UI updates reactively when the listener writes land). Wired to
      start on trainer login / stop on logout in `AuthViewModel`. `HistoryEntity` intentionally
      stays Room-only (superseded by `workoutLogs`, see Product goal #3). Verified via
      `./gradlew assembleDebug` — not runtime-tested against a live device/emulator (none set up
      in this environment); the Student-side write path (§5b) doesn't exist yet, so the
      `workoutLogs` sync direction is exercised by the listener/rules but has no writer yet.
- [x] Firestore schema, per-trainer scoped (`trainerId` field on every doc), implemented for
      `students`, `workouts` (incl. `status`/`assignedAt`), `biometrics`, `schedules`,
      `workoutLogs` — matches `firestore.rules`. **Not done:** `trainerId` on the Student's own
      `users/{uid}` doc — that's set by the §7 linking mechanism, which is blocked on the Blaze
      plan decision (Cloud Function), so there's no writer for it yet.
- [x] New Room entity `WorkoutLogEntity` + `PerformedSet` (`data/model/PerformedSet.kt`,
      `data/local/entity/WorkoutLogEntity.kt`) — same JSON-in-column pattern as `Exercise`.
- [x] Room migration strategy: `exportSchema = true` (schema committed at
      `app/schemas/.../6.json`), real `MIGRATION_5_6` (adds `workouts.status`/`assignedAt`,
      creates `workout_logs`) registered via `.addMigrations(...)`, `fallbackToDestructiveMigration`
      kept only as a safety net for anything without an explicit migration path.

## 5. Frontend (Jetpack Compose)

**5a. Existing (Trainer/ADM side)**
- [x] **Trainer role** — fully built and routed (`AppNavigation.kt`): Main (students list +
      bottom-nav tabs including `ScheduleScreen`), AddStudent, EditStudent, StudentDetails,
      ManualWorkout (detailed exercise builder), WorkoutBuilder, AIWorkout (Gemini generation +
      "Smart Paste" import via `WorkoutParser.kt`), Settings (API key entry).
- [x] **ADM role** — `AdminDashboardScreen` exists and is routed from `RoleRouter`; all three tabs
      are now real (see §5e — done 2026-08-17 via `/execgoals`).
- [x] Evolution/biometrics chart exists: `Components.kt` has a custom `WeightChart` (Compose
      `Canvas`, hand-drawn line + points), used from `StudentDetailsScreen`. No charting library
      dependency — keep it that way; extend this same component for exercise-load progression
      (5c) instead of adding a charting library.

**5b. Student role (Product goal #2) — done 2026-08-17 via `/execgoals`**
- [x] `RoleRouter` now routes `Authenticated(STUDENT)` with a claimed `trainerId` to a real
      `StudentNavigation` (bottom nav: Treinos / Evolução), instead of the old dead-end message
      card. Unclaimed students still see `LoginScreen`'s invite-code entry (§7).
      - **My Workouts** (`StudentWorkoutsScreen`) — read-only list of ficha(s) the Trainer assigned
        (`workouts` where `studentId == me && status == assigned`), expandable per-card to show
        exercises/sets/reps/weight targets.
      - **Log Session** (`StudentLogSessionScreen`) — per exercise in the workout, the Student
        enters sets × weight × reps performed and submits — writes one `workoutLogs` doc per
        exercise (§4a). This is the "atualização de carga" from Product goal #3.
      - **My Evolution** (`StudentEvolutionScreen`) — biometrics chart (`WeightChart`) +
        per-exercise load-progression chart (`ExerciseProgressionChart`, shared with §5c).
      - New `StudentRepository` reads straight from Firestore (`callbackFlow` snapshot listeners)
        instead of Room — the student's device never runs `TrainerRepository.startListening`, so
        Room would be empty there. Writes reuse `TrainerRepository.insertWorkoutLog`.
      - Verified via `./gradlew compileDebugKotlin testDebugUnitTest lint` (all pass) — not
        runtime-tested against a live device/emulator (none set up in this environment).

**5c. Trainer — receiving updates + evolution report (Product goal #3, #4) — done 2026-08-17**
- [x] "Atividade Recente" section added to `StudentDetailsScreen` listing the student's latest
      logged sessions (date, exercise, weight/reps), sourced from `TrainerRepository`'s existing
      `workoutLogs` Room mirror (already real-time via the §4a snapshot listener — no new listener
      needed). No push notifications added, per the original "don't add FCM" scope note.
- [x] `WeightChart` generalized into a `LineChart(points, emptyMessage)` reusable component
      (`Components.kt`); `WeightChart` is now a thin wrapper over it. New `ExerciseProgressionChart`
      (exercise picker + `LineChart`) built once and shared by both `StudentDetailsScreen` (Trainer
      side) and `StudentEvolutionScreen` (Student's own view).

**5d. Concrete UI/professionalism debt (Product goal #5, #6) — found while reading the code**
- [x] `DayAgendaItem`'s "add appointment" button — turned out to already be fixed: `ScheduleScreen.kt`
      has its own working `DayAgendaItem(day, schedules, students, onBookSlot)` wired to
      `viewModel.bookSlot(...)` → `repository.insertSchedule(...)`. The unwired duplicate this item
      described lived in `Components.kt` as dead code (different signature, never called from
      anywhere) — deleted it.
- [x] Hardcoded colors swept across every screen (`Components.kt`, `ScheduleScreen.kt`,
      `WorkoutBuilderScreen.kt`, `AdminDashboardScreen.kt`, `StudentDetailsScreen.kt`,
      `StudentsScreen.kt`, `ManualWorkoutScreen.kt`, `LoginScreen.kt`, `AIWorkoutScreen.kt`) and
      replaced with `MaterialTheme.colorScheme` tokens. Gender card tint now sources
      `tertiaryContainer`/`secondaryContainer` as suggested. Added one shared `SuccessGreen`
      constant (`Components.kt`) for the "active/online" indicators M3 has no built-in role for,
      instead of the same hex duplicated across files.
- [x] Loading/empty/error state sweep: the explicit examples named here (empty students list,
      empty workout list) turned out to already exist (`StudentsScreen`, `WorkoutBuilderScreen`).
      Added the one genuinely missing case found: an empty-exercises-list state in
      `ManualWorkoutScreen`. Did not build a general loading-skeleton system — no screen is
      Firestore-mid-load blocking today (offline-first Room reads are synchronous from cache).
- [x] Form validation added: `AddStudentScreen`, `EditStudentScreen` (name required, at least one
      training day required, inline `supportingText` errors) and `ManualWorkoutScreen` +
      `AddExerciseDialog` (workout name / exercise name required, inline errors) — all previously
      silent no-ops on missing required fields.
- [x] **`WorkoutBuilderScreen.kt`'s "Criar Manual"/"Criar com IA" buttons wired** —
      `onNavigateToManual`/`onNavigateToAI` params added, call the existing `ManualWorkout`/
      `AIWorkout` routes (same pattern already used from `StudentDetailsScreen`). **Found while
      wiring: the screen itself was completely unreachable** — no button anywhere navigated to
      `Screen.WorkoutBuilder`; `StudentDetailsScreen`'s own "Ficha Personal" button already
      reached the AI/Manual screens directly via a dialog, bypassing `WorkoutBuilderScreen`
      entirely. Since `WorkoutBuilderScreen` additionally lists all active workouts with
      edit/toggle/delete (which the read-only list on `StudentDetailsScreen` doesn't have), user
      decision: keep both, link it — added a "Gerenciar" button next to `StudentDetailsScreen`'s
      "Fichas de Treino" header navigating to `Screen.WorkoutBuilder.createRoute(studentId)`.
      Verified via `./gradlew assembleDebug`.
      - [ ] "Editar" (`WorkoutCard`'s edit icon inside `WorkoutBuilderScreen`) still has no
        destination — no edit-existing-workout screen exists anywhere in the app. Out of scope for
        this pass; build one later (reuse `ManualWorkoutScreen`'s exercise-list UI, prefilled,
        calling `updateWorkout` instead of `insertWorkout`) or remove the dead icon — not decided.

- [x] **AI ficha generation — ground it in the hypertrophy volume reference table (researched
      2026-08-17 via `/newgoal`, user supplied the actual PDF this session:
      `tabela_volume_direto_indireto_hipertrofia_final_v9.pdf`, 4 pages, ~15.7KB). Implemented
      2026-08-17 via `/execgoals` (approach 1, text-embedding — see below): asset created at
      `app/src/main/assets/hypertrophy_volume_reference.md` with the exact content specified;
      `GenerativeAiService` now takes `@ApplicationContext Context` (Hilt), reads the asset once
      (`by lazy`, the service is `@Singleton`), and appends it plus a short usage instruction to
      `buildPrompt()` — applies to both `AiProvider.GEMINI` and `AiProvider.OPENAI` since both go
      through the same `buildPrompt()`. `AIWorkoutViewModel`'s JSON-parsing contract untouched, as
      planned. Verified via `./gradlew compileDebugKotlin testDebugUnitTest lint` (all pass, one
      pre-existing `@param:` annotation-target warning, same pattern already present in
      `SettingsRepository`) — **not yet verified against a live API call** (no
      `google-services.json`/real Gemini or OpenAI key in this environment) — first real
      generation should be checked for whether the model actually references the table in its
      exercise choices, not just that the code compiles.**

      Before this, `GenerativeAiService.generateWorkout()` sent only a text prompt built from the
      student's profile fields (§3) to whichever provider is selected (`AiProvider.GEMINI`/
      `OPENAI`, done 2026-08-17 via `/execgoals`, see §5e). Goal: make the AI balance weekly volume
      per muscle group using this table instead of general knowledge alone, for both providers.
      - **What the PDF actually is** (read directly, not guessed): a scoring table, not prose —
        for ~70 named exercises across 6 categories (Empurrar, Puxar, Quadril/joelho, Posterior/
        hinges, Monoarticulares, Core/calistenia), each exercise has a 0–1.0 score per muscle
        (1.0 = direct/primary target, 0.75 = strong secondary, 0.5 = relevant indirect, 0.25 =
        low, 0 = don't count), representing how much one hard set of that exercise counts toward
        that muscle's weekly effective hypertrophy volume. Plus a short RIR-based adjustment
        section (§7 of the PDF: full value at 0–2 RIR, secondaries −0.25 at 3–4 RIR, half-or-zero
        at 5+ RIR) and a sourced-references section (Schoenfeld, Kubo, Plotkin, etc. — informational
        provenance, not needed at inference time).
      - **Two technical approaches researched — recommendation: text-embedding, not raw PDF
        upload:**
        1. **Recommended — extract once, embed as text in the existing prompt.** Convert the
           table to a compact Markdown block (see exact content below) bundled as an Android
           asset, and append it to `buildPrompt()`'s existing string for **both** providers,
           unchanged from today's plain-text call shape (`content { text(fullPrompt) }` for
           Gemini, the existing JSON `messages` array for OpenAI). No SDK migration needed, no
           multimodal API differences to reconcile between providers, no per-call PDF
           reprocessing cost, and no OCR/table-transcription risk — the numbers are guaranteed
           byte-exact instead of hoping the model reads a rendered table correctly. This is the
           better engineering choice specifically *because* the source document is already small,
           dense, and precisely structured — text-embedding a lossy-transcription risk that raw
           multimodal input carries for exactly this kind of tabular reference.
        2. **Alternative — native multimodal PDF upload (not recommended here, but real and
           available if the reference material later becomes large/prose-heavy/frequently
           changing).** Researched current (2026-08-17) capabilities for both providers:
           - **Gemini**: supported via `content { inlineData(bytes = pdfBytes, mimeType =
             "application/pdf") }`, but only on the **Firebase AI Logic SDK**
             (`com.google.firebase:firebase-ai`) — the deprecated SDK this project still uses
             (`com.google.ai.client.generativeai`) doesn't have this call shape, so approach 2
             would force the §3 SDK migration as a hard prerequisite. Limits confirmed via
             Firebase's own input-file-requirements page: 50MB/file, 1000 pages/file, but **the
             *inline* request total is capped at 20MB** (PDFs are tokenized like images) —
             irrelevant at this PDF's 15.7KB, but worth knowing if a bigger reference doc is used
             later. (Source: firebase.google.com/docs/ai-logic/input-file-requirements)
           - **OpenAI**: also now supports direct PDF input to Chat Completions (base64 or file
             URL; the API extracts text *and* renders page images internally for vision-capable
             models like `gpt-4o`/`gpt-4o-mini`) — this is new since the original 2026-08-16
             research pass, which had assumed OpenAI needed the Files API/assistants flow. Real
             caveats found: PDF input burns meaningfully more tokens than plain text (whole pages
             processed as images), file inputs are capped at 100 pages / 32MB per request, and
             there are open community bug reports of inconsistent extraction ("works with some
             API keys but fails for others" — community.openai.com/t/1390246). (Source:
             platform.openai.com/docs/guides/pdf-files, openai.com dev announcement.)
           - Bottom line: approach 2 is viable for *both* providers today, but costs more tokens
             per call, adds a real transcription-fidelity risk for a table this precise, and for
             Gemini specifically reopens the not-yet-done SDK migration as a blocker. Don't build
             this now; revisit only if a future reference document doesn't compress well to text
             (e.g. a large illustrated exercise-technique guide).
      - **Implementation shape (approach 1) for `/execgoals`:**
        1. Create `app/src/main/assets/hypertrophy_volume_reference.md` with exactly the content
           block below (already extracted and condensed from the PDF — the long "why this score"
           prose and the academic-citations section are dropped, since they inform *how the table
           was built*, not how the model should *use* it; keeping them would just burn prompt
           tokens on every single generation call for no behavioral benefit).
        2. `GenerativeAiService` needs `@ApplicationContext Context` added to its constructor
           (Hilt-provided, no new module needed) to read the asset via
           `context.assets.open("hypertrophy_volume_reference.md").bufferedReader().use { it.readText() }`
           — cache it in a `private val` (read once per `GenerativeAiService` instance, it's
           `@Singleton`, not per-call).
        3. Append the reference text to `buildPrompt()`, after the existing student-profile block,
           with a short instruction wrapping it — e.g. (adjust wording to match the existing
           prompt's tone, don't just concatenate verbatim):
           ```
           Use a tabela de referência abaixo para balancear o volume semanal por grupo muscular ao
           escolher e distribuir os exercícios da ficha. Cada valor indica quanto uma série "dura"
           daquele exercício conta como volume efetivo de hipertrofia para aquele músculo (0 a
           1,0; ver a régua de pontuação). Priorize cobrir os grupos musculares relevantes ao
           objetivo do aluno sem concentrar volume demais em poucos músculos.

           {reference text}
           ```
        4. No change needed to `AIWorkoutViewModel`'s JSON-parsing contract (`AIWorkoutResponse`/
           `AIWorkout`/`AIExercise`) — the reference table only changes what grounds the model's
           choice of exercises/sets, not the requested output shape. Confirmed unchanged from the
           original 2026-08-16 research.
        5. This is a **fixed reference bundled for every trainer**, not a per-trainer configurable
           upload — matches the actual ask (the user supplied one specific table they trust, not
           "let each trainer bring their own"). If per-trainer custom references become a real
           want later, that's a distinct, larger feature (Settings upload + storage +
           per-generation file selection) — don't build it speculatively now.
        6. **No longer coupled to §3's SDK migration** — unlike the original 2026-08-16 draft of
           this item, approach 1 works today on the current (deprecated but functional)
           `com.google.ai.client.generativeai` SDK for Gemini and on the existing
           `HttpURLConnection` call for OpenAI. §3's SDK migration is still worth doing for its own
           reasons (client-side key exposure, general deprecation), just no longer a prerequisite
           for this feature. (§3's cross-reference to this item has been corrected accordingly.)
        7. Token-cost note: the condensed Markdown block below is roughly 1.5–2k tokens, added to
           *every* `generateWorkout()` call for *both* providers. Acceptable at this size; if the
           reference table grows substantially later, consider trimming rarely-relevant exercise
           categories per-call based on the student's stated training days, rather than always
           sending the whole table — not needed at today's size, don't build it preemptively.

      **Exact content for `app/src/main/assets/hypertrophy_volume_reference.md`:**
      ```markdown
      # Tabela de Volume Direto/Indireto para Hipertrofia

      Estima quanto uma série dura de um exercício conta para a hipertrofia provável de cada
      músculo (não é % de ativação, não precisa somar 1 na mesma linha). Use para séries de boa
      qualidade, amplitude adequada, ~0-3 reps em reserva.

      Régua: 1,0 = volume direto/alvo principal · 0,75 = secundário muito forte/quase direto ·
      0,5 = indireto relevante · 0,25 = participação baixa · 0 = não contar.

      ## Empurrar
      | Exercício | Peitoral | Delt. ant. | Delt. lat. | Delt. post. | Tríceps geral | Cabeça longa tríceps |
      |---|---|---|---|---|---|---|
      | Supino reto | 1 | 0,5 | 0 | 0 | 0,5 | 0,25 |
      | Supino inclinado | 1 | 0,75 | 0 | 0 | 0,5 | 0,25 |
      | Paralela inclinada / foco peito | 1 | 0,5 | 0 | 0 | 0,75 | 0,25 |
      | Paralela vertical / foco tríceps | 0,75 | 0,5 | 0 | 0 | 1 | 0,25 |
      | Tríceps banco alta amplitude | 0,5 | 0,5 | 0 | 0 | 1 | 0,25 |
      | Desenvolvimento vertical | 0,25 | 1 | 0,75 | 0 | 0,5 | 0,25 |
      | Flexão tradicional | 1 | 0,5 | 0 | 0 | 0,5 | 0,25 |

      ## Puxar
      | Exercício | Latíssimo/redondo maior | Trapézio médio/romboides | Delt. post. | Bíceps | Braquial/braquiorradial |
      |---|---|---|---|---|---|
      | Puxada/barra fixa pronada | 1 | 0,25 | 0,25 | 0,5 | 0,5 |
      | Puxada/barra fixa neutra | 1 | 0,25 | 0,25 | 0,5 | 0,75 |
      | Puxada/barra fixa supinada | 1 | 0,25 | 0,25 | 0,75 | 0,5 |
      | Remada neutra cotovelo junto | 1 | 0,75 | 0,5 | 0,5 | 0,75 |
      | Remada supinada cotovelo junto | 1 | 0,75 | 0,5 | 0,75 | 0,5 |
      | Remada aberta / high row | 0,5 | 1 | 1 | 0,5 | 0,5 |
      | Remada australiana pronada | 1 | 1 | 1 | 0,5 | 0,5 |
      | Remada australiana supinada | 1 | 0,75 | 0,75 | 0,75 | 0,5 |

      ## Quadril e joelho (agachamentos, leg press, unilaterais)
      | Exercício | Vastos/quadríceps | Reto femoral | Isquios | Glúteo máx. | Glúteo médio | Adutores | Eretor |
      |---|---|---|---|---|---|---|---|
      | Agachamento profundo | 1 | 0,25 | 0,25 | 1 | 0,25 | 1 | 0,5 |
      | Agachamento sumô | 1 | 0,25 | 0,25 | 0,75 | 0,25 | 1 | 0,25 |
      | Leg press 45° profundo | 1 | 0,25 | 0,25 | 1 | 0 | 0,75 | 0 |
      | Leg press 180° profundo | 1 | 0,25 | 0,25 | 1 | 0 | 0,75 | 0 |
      | Leg press 180° unilateral profundo | 1 | 0,25 | 0,25 | 1 | 0,25 | 0,75 | 0 |
      | Hack squat | 1 | 0,25 | 0 | 0,5 | 0 | 0,5 | 0 |
      | Afundo padrão | 1 | 0,25 | 0,25 | 0,75 | 0,5 | 0,5 | 0 |
      | Búlgaro | 1 | 0,25 | 0,5 | 1 | 0,5 | 0,5 | 0 |
      | Agachamento unilateral | 1 | 0,25 | 0,5 | 1 | 0,75 | 0,5 | 0 |
      | Step-up médio/alto | 1 | 0,25 | 0,5 | 1 | 0,75 | 0,5 | 0,25 |

      ## Posterior, glúteo e hinges
      | Exercício | Vastos/quadríceps | Reto femoral | Isquios | Glúteo máx. | Glúteo médio | Adutores | Eretor | Gastrocnêmio |
      |---|---|---|---|---|---|---|---|---|
      | Stiff | 0 | 0 | 1 | 0,75 | 0 | 0,25 | 0,75 | 0 |
      | RDL | 0 | 0 | 1 | 0,75 | 0 | 0,25 | 0,5 | 0 |
      | Terra convencional | 0,5 | 0 | 0,5 | 0,75 | 0 | 0,25 | 1 | 0 |
      | Terra sumô | 0,5 | 0 | 0,5 | 0,75 | 0,25 | 1 | 0,5 | 0 |
      | Elevação pélvica / hip thrust | 0 | 0 | 0,25 | 1 | 0,25 | 0 | 0 | 0 |
      | Flexão nórdica / Nordic | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0,25 |

      ## Monoarticulares e isolados (alvo 1,0 → outros níveis)
      | Exercício | 1,0 | 0,75 | 0,5 | 0,25 |
      |---|---|---|---|---|
      | Cadeira extensora | Vastos; reto femoral; quadríceps | - | - | - |
      | Mesa/cadeira flexora | Isquiotibiais | - | - | Gastrocnêmio (se tornozelo dorsifletido) |
      | Panturrilha em pé | Gastrocnêmio | Sóleo | - | - |
      | Panturrilha sentada | Sóleo | - | - | Gastrocnêmio |
      | Elevação lateral | Deltoide lateral | - | - | Delt. ant.; post.; trapézio superior |
      | Crucifixo inverso | Deltoide posterior | - | Trapézio médio/romboides | - |
      | Peck deck / crucifixo | Peitoral | - | - | Deltoide anterior |
      | Rosca supinada / Scott / 45° / Bayesian | Bíceps braquial | - | Braquial | Braquiorradial |
      | Rosca martelo | Braquial/braquiorradial | Bíceps braquial | - | - |
      | Rosca reversa | Braquiorradial/braquial | - | - | Bíceps braquial |
      | Tríceps pushdown | Tríceps geral | Cabeça longa | - | - |
      | Tríceps overhead/francês | Tríceps geral; cabeça longa | - | - | - |
      | Tríceps coice/coreano | Tríceps geral | - | Cabeça longa | Delt. post./latíssimo |
      | Cadeira abdutora | Glúteo médio/mínimo | - | TFL | Glúteo máximo (fibras superiores) |
      | Cadeira adutora | Adutores | - | - | - |
      | Pulldown braços estendidos | Latíssimo/redondo maior | - | - | Delt. post.; cabeça longa tríceps; peitoral esternal |

      ## Core, calistenia e peso corporal
      | Exercício | 1,0 | 0,75 | 0,5 | 0,25 |
      |---|---|---|---|---|
      | Abdominal na rodinha | Reto abdominal | Oblíquos; core profundo | - | Serrátil; peitoral; latíssimo; tríceps |
      | Prancha abdominal tradicional | - | - | Reto abdominal; oblíquos; core profundo | Serrátil; deltoide ant.; eretor; glúteo máx.; reto femoral |
      | Muscle-up estrito | Latíssimo/redondo maior | Bíceps; peitoral; tríceps geral; antebraço | Braquial/braquiorradial; deltoide ant.; trapézio/romboides; serrátil; core | Deltoide posterior |

      ## Ajustes por RIR (aplicar antes de somar volume)
      - 0-2 RIR e boa amplitude: valor cheio.
      - 3-4 RIR: mantém o principal se a série foi desafiadora, mas reduz secundários em 0,25.
      - 5+ RIR: conta no máximo metade do valor, ou não conta.
      - Músculo-alvo não foi limitante (ex.: stiff interrompido pela lombar antes dos posteriores):
        reduza o valor, não conte como 1.
      ```

**5e. ADM Dashboard — currently 100% mocked (found 2026-08-17, from a real-device screenshot
after the first successful ADM login).** All three tabs render fixed data that never changes and
don't reflect anything real. Each needs its own fix:

- [x] **Logs tab — done 2026-08-17, user chose "Proper (fleet-wide)".** Wired Firebase Crashlytics
      (`firebase-crashlytics` + Gradle plugin) instead of a Room-based log viewer. Catch blocks in
      `GenerativeAiService` (both providers) and `TrainerRepository`'s snapshot listeners now call
      `FirebaseCrashlytics.getInstance().recordException(...)` — previously fully silent.
      Deliberately **not** wired into `AuthRepository`'s login/register/resetPassword/claimInvite
      catch blocks: those are routine, already-user-surfaced failures (wrong password, invalid
      invite code), not silent bugs — recording every failed login as a Crashlytics exception
      would be noise, not signal. Since Crashlytics has no client-side read API, `LogsTab` no
      longer shows an inline log list — it explains where errors go now and links to
      `console.firebase.google.com/project/{projectId}/crashlytics` (project id read at runtime
      from `FirebaseApp.getInstance().options`). "Copiar"/"Limpar" removed (nothing to copy/clear
      locally anymore).
      - **Compat note:** `firebase-crashlytics-gradle:3.0.0` has a known circular-dependency bug
        with KSP (`injectCrashlyticsMappingFileIdDebug` ↔ `kspDebugKotlin`, confirmed via
        upstream GitHub issues firebase/firebase-android-sdk#5925 and #5930); pinned to `3.0.7`
        (latest patch, includes the fix) instead. `2.9.9` (the suggested workaround before the
        patch) doesn't work either — it uses the removed `applicationVariants` API against this
        project's AGP 9.3.1.
- [x] **Gestão tab — done 2026-08-17.** New `AdminViewModel` (`FirebaseFirestore` injected
      directly, ADM-only cross-trainer data). "Personais"/"Total Usuários" cards use the researched
      count-aggregation query; "Personais Ativos" lists real trainer docs (`get()` on
      `role == "TRAINER"`, name only for now). No `firestore.rules` change needed, as researched
      (`isAdmin()` doesn't depend on `resource.data`, so it's provable for the whole query).
- [x] **APIs tab — done 2026-08-17, user chose "Implementar de verdade" for OpenAI** (not the
      recommended removal). `GenerativeAiService` now takes an `AiProvider` (GEMINI/OPENAI);
      `AIWorkoutScreen` got a Gemini/ChatGPT `FilterChip` toggle. OpenAI calls
      `api.openai.com/v1/chat/completions` (`gpt-4o-mini`) via plain `HttpURLConnection` +
      `kotlinx.serialization` — no new HTTP dependency (OkHttp/Retrofit) for one POST call.
      Status rows: Firestore does a real `.limit(1).get()` probe with a 5s timeout (Online/
      Offline); Gemini/OpenAI show "Configurada"/"Não configurada" **for this device only**, with
      an explicit caption explaining why — both are still per-trainer keys (§3), so there is no
      single fleet-wide "is AI online" signal until the §3 Cloud Function proxy exists.

## 6. Connectivity
- [x] Client↔Firestore sync strategy per §4: snapshot listeners (`TrainerRepository.startListening`,
      `addSnapshotListener`), not one-shot fetches; Firestore's built-in offline cache is used as-is,
      no custom queue.
- [x] Trainer→Student ficha assignment is a Firestore write (`WorkoutEntity.status` flips
      `draft`↔`assigned`) the Student's snapshot listener picks up (`StudentRepository`'s
      `whereEqualTo("status", "assigned")` query) — no push/notification transport needed,
      Firestore's own real-time listeners cover both directions (assignment down, `workoutLogs`
      up). This is the whole "connects with the trainer" mechanism from Product goal #2/#3 — no
      extra messaging layer required. **Bug found and fixed 2026-08-18** while verifying this
      item: `status`/`assignedAt` were dead fields — nothing ever wrote `status = "assigned"`,
      only `isActive` was toggled by the UI, so the Student's query would never have matched
      anything. Fixed by deriving `status`/`assignedAt` from `isActive` in
      `TrainerRepository.insertWorkout`/`updateWorkout` (`withDerivedStatus()`), one point of
      truth for every workout-creation call site (AI, manual, toggle) instead of touching each one.
- [x] **Moot as of 2026-08-18** — §3's Cloud Function proxy plan was dropped (Firebase Spark plan
      can't deploy Cloud Functions at all; the user chose to stay on the free plan). Gemini calls
      go through the Firebase AI Logic SDK directly from the client instead, so there's no
      client↔Cloud Function contract to define — the SDK's own request/response shape is the
      contract, and it's already what `GenerativeAiService`/`WorkoutParser` are built around.
- [x] No other third-party integrations in scope currently (no push notifications, no payments —
      confirmed absent; do not add unless requested).

## 7. Auth
- [x] Firebase Auth (email/password) + Firestore-stored `role` field, read client-side.
- [x] `firestore.rules` written (users self-read, role/trainerId self-promotion blocked,
      students/workouts/biometrics/schedules/workoutLogs scoped by `trainerId`, students read-only
      on their own docs) and published via the Firestore console Rules tab. Verified live with an
      unauthenticated REST probe returning `403 PERMISSION_DENIED` (not open, not 404-missing-db).
- [x] **Student↔Trainer linking — revised 2026-08-17: invite-code pattern, no Cloud Function
      needed. Implemented 2026-08-17 via `/execgoals`, data-model decision: option 1 (unify).**
      The original plan required a Cloud Function (blocked on the Blaze plan). Researched
      an alternative that stays on Spark: a short-lived invite code, stored as its own Firestore
      doc, validated entirely inside `firestore.rules` — a standard pattern for exactly this
      problem (general confirmation: Firestore rules can reference *other* documents via `get()`/
      `exists()` inside a condition, which is what makes self-service claims like this safe without
      a server). Design:
      - New collection `invites/{code}` — `code` is a random ~8-char id generated client-side
        (`UUID.randomUUID().toString().take(8).uppercase()` is fine, collision risk is negligible
        at this scale). Doc: `{trainerId, used: false, createdAt}` (+ whatever student-profile
        draft fields the data-model decision below needs).
      - Rules: `allow create: if isOwningTrainer(request.resource.data.trainerId) &&
        request.resource.data.used == false;` — only the trainer can mint one, and only unused.
        `allow read: if isSignedIn();` — a prospective student needs to look up the code to
        validate it before claiming (codes are random+long enough that guessing isn't practical,
        same tradeoff every "invite link" system makes). `allow update` only permits the one
        `used: false -> true` transition, `trainerId` unchanged — nothing else about an invite can
        ever be edited.
      - `users/{uid}` rules gain a **create**-time (not update-time — a self-registered student has
        no `users/{uid}` doc yet, so this is their very first write) exception: `allow create: if
        isAdmin() || (isSignedIn() && request.auth.uid == uid && request.resource.data.role ==
        'STUDENT' && get(/databases/$(database)/documents/invites/$(request.resource.data.inviteCode)).data.trainerId
        == request.resource.data.trainerId && get(...).data.used == false);` — a student can claim
        `role: STUDENT` + `trainerId: X` for themselves *only* by presenting a currently-valid,
        unused invite that was minted by trainer X. The existing `update` rule (role/trainerId
        immutable after the first write) is untouched, so this is a true one-time claim — exactly
        the same self-promotion protection as before, just with one narrow, provable exception.
      - UI: Trainer gets a "Gerar convite" action (new invite doc + share sheet with the code).
        Student gets a "Tenho um código de convite" entry point (probably on first login when
        `authState` resolves to `Authenticated` with no role — reuse the message card just added
        to `LoginScreen`, turn it into an input instead of a dead-end).
      - **Open data-model question — needs a decision before implementation, not a silent pick:**
        today `AddStudentScreen` writes a `UserEntity`/`students` doc keyed by a random
        client-generated UUID, entirely disconnected from any Firebase Auth account (there's no
        login for that student at all). Once a student has a *real* Auth uid, every existing
        `resource.data.studentId == request.auth.uid` check in `firestore.rules` (and every
        `workouts`/`biometrics`/`schedules`/`workoutLogs` write from `TrainerRepository`) implicitly
        assumes `studentId` *is* that uid. Two ways to reconcile, pick one:
        1. **Unify**: stop treating `students/{id}` as a separate collection for linked students —
           a linked student's profile *is* their `users/{uid}` doc (role, trainerId, name, phone,
           goal, trainingDays, etc. all together). `students/{id}` stays only for trainer-authored
           drafts *before* an invite is claimed; claiming migrates the draft's fields into
           `users/{uid}` and the trainer can archive/delete the draft. Fewer moving parts long-term,
           but touches `TrainerRepository`, `AddStudentScreen`, `StudentDetailsScreen`, and
           `FirestoreMappers` (all currently built around `UserEntity`/`students`).
        2. **Bridge**: keep `students/{id}` exactly as-is (still keyed by the original random id,
           still where `AddStudentScreen`/`StudentDetailsScreen` read/write from), and add a
           `linkedUid` field set once an invite is claimed; every place that currently does
           `studentId == request.auth.uid` instead resolves through one extra lookup
           (`students` doc where `linkedUid == request.auth.uid`). Less code churn in the existing
           trainer-side screens, but every rule and every `workouts`/`biometrics`/... write gains a
           layer of indirection, and Firestore rules can't easily do this uid-and-not know
(` in`/`array-contains` queries inside rules exist but add real complexity).
        Recommendation: **option 1 (unify)** — it's more work up front but removes a permanent
        source of confusion (two ids referring to the same person) instead of papering over it.
      - **Implemented 2026-08-17:** `UserEntity.linked` flag (Room migration 6→7) distinguishes a
        pre-invite draft (`students/{id}`) from a linked profile (`users/{uid}`);
        `TrainerRepository.updateUser`/`deleteUser` branch on it. `invites/{code}` collection +
        `users/{uid}` create-time claim exception added to `firestore.rules` (also extended
        `users/{uid}` `allow delete` to the owning trainer, for symmetry with every other
        collection — a linked student's account can now be removed the same way an unclaimed
        draft can). `AuthRepository.claimInvite` uses a Firestore transaction so two devices can't
        claim the same code in a race. `StudentDetailsScreen` got a "Gerar Convite" action;
        `LoginScreen` got the code-input claim UI, replacing the old dead-end message card.
        **⚠️ `firestore.rules` changes are only code until published** — same manual step as the
        first version (no Firebase CLI/`firebase.json` in this repo): copy the file into the
        Firestore console's Rules tab and publish. Not done as part of this pass — I can't reach
        the console from here.
- [x] Add basic auth UX gaps: password reset flow now that self-registration exists (`register()`
      already added to `AuthRepository`/`AuthViewModel`/`LoginScreen`, 2026-08-16 — password reset
      is the remaining gap, same screen, `auth.sendPasswordResetEmail(email)`). **Done 2026-08-17.**

## 8. Security
- [x] `<uses-permission android:name="android.permission.INTERNET" />` added to `AndroidManifest.xml`.
- [x] Gemini/OpenAI API keys — **backup exclusion done**: excluded the DataStore file
      (`datastore/settings.preferences_pb`) in both `data_extraction_rules.xml` (cloud-backup +
      device-transfer, API 31+) and `backup_rules.xml` (legacy full-backup-content) — the key no
      longer rides along in Android's automatic cloud/local backups. **Encryption at rest: not
      done, and the GOALS.md suggestion to use it is now stale** — researched
      `androidx.security.crypto` before implementing (good thing: checked before recommending) and
      found `MasterKey`/`EncryptedSharedPreferences` are now themselves deprecated upstream
      ("Use `javax.crypto.KeyGenerator` with `AndroidKeyStore` instead" — androidx source, 2026).
      Hand-rolling Keystore-backed AES/GCM correctly (IV handling, migrating already-stored
      plaintext values, key alias lifecycle) is real security-sensitive work that deserves its own
      pass, not a rushed add-on here. Once §3's proxy exists the key may not need to live
      on-device at all, which could make this moot — decide after §3, not before.
- [x] `firestore.rules` written and published (see §7) — no longer running in open/test mode.
- [x] R8 shrinking/obfuscation enabled (`optimization { enable = true }`). Verified with a real
      `./gradlew assembleRelease` (not just a config read) — `minifyReleaseWithR8`,
      `optimizeReleaseResources` and the mandatory `lintVitalRelease` check all passed with the
      existing `keepRules/rules.keep` (empty) and no extra keep rules needed: Room/Hilt/Firebase
      each ship their own consumer R8 rules inside their AARs. Produced
      `app/build/outputs/apk/release/app-release-unsigned.apk`.
- [x] Target API compliance: `targetSdk = 37` already exceeds Google Play's Aug 31, 2026
      requirement (API 36 for new apps/updates) — confirmed compliant, no action needed.
- [x] **Firebase App Check — done 2026-08-17.** (noticed the console's own banner prompting this
      while working in Firestore, 2026-08-17: "Proteja os recursos do Cloud Firestore de abusos,
      como fraude de faturamento ou phishing"). App Check attests that requests hitting
      Firestore/Auth/the future Cloud Function actually come from *this* real app build, not a
      script replaying the API key — directly relevant now that self-registration (`register()`)
      and the invite-code system above both accept unauthenticated-adjacent writes (account
      creation, invite lookups) that a script could otherwise hit directly with just the public
      API key. `firebase-appcheck-playintegrity` added; `MainApplication.onCreate()` installs
      `PlayIntegrityAppCheckProviderFactory` before any Firebase call. **⚠️ Needs one manual step
      in the Firebase Console** (Console → App Check → register the Android app → Play Integrity
      provider) — the client-side wiring alone doesn't turn on enforcement; until that's done in
      the console, App Check runs in an unenforced/monitoring-only state. Not done as part of
      this pass — same reason as the `firestore.rules` publish above, no console access from here.

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

## 10. Code quality
- [x] `./gradlew lint` runs clean (0 errors, 0 warnings). Fixed the 2 real errors: an unescaped
      drive-letter colon in `local.properties` (`PropertyEscape`), and a genuine
      `NonObservableLocale` bug in `StudentDetailsScreen.kt` (`Locale.getDefault()` called inside
      a composable doesn't recompose on locale change — switched to
      `LocalConfiguration.current.locales[0]`, the stable, recomposition-safe equivalent;
      `LocalLocale` didn't compile against this project's pinned Compose BOM). Deleted 3 unused
      template colors (`purple_500`, `teal_700`, `white`). Explicitly suppressed (not silently,
      documented in `app/lint.xml`) the 15 "newer dependency version available" warnings —
      bumping them (esp. Compose BOM 2024.12.01, ~1.5 years behind) is real upgrade work needing
      runtime verification this environment can't do; left as a dedicated future pass.
- [x] `StudentDetailsScreen.kt` (393→262 lines) and `ManualWorkoutScreen.kt` (250→155 lines) split:
      dialogs, the top bar's overflow menu, and small display rows moved to new sibling files
      `StudentDetailsComponents.kt` / `ManualWorkoutComponents.kt` (screen keeps orchestration —
      state + the `LazyColumn`/`Scaffold` — supporting composables live alongside it). Behavior
      unchanged; verified via `./gradlew verify compileDebugAndroidTestKotlin` (all green).

## 11. CI / Deployment
- [x] `.github/workflows/android-ci.yml` added: runs on push/PR to `main` — sets up JDK 21,
      writes `app/google-services.json` from a `GOOGLE_SERVICES_JSON` repo secret, runs
      `./gradlew verify` (lint + unit tests, the §9 task) then `assembleDebug`, uploads the lint
      HTML report as an artifact. `connectedAndroidTest`/instrumented tests deliberately excluded
      (no emulator matrix set up — can come later). YAML syntax validated locally.
      **Repo secret added 2026-08-21** (`gh secret set GOOGLE_SERVICES_JSON`, user confirmed) —
      confirmed live via a real green run, not just "added and assumed working": rerunning the
      previously-failing CI run after adding the secret produced a full pass (`Lint + unit tests`,
      `Assemble debug APK`, lint report upload, all green). **A second, previously-undiscovered
      bug was also blocking every CI run before this, found while debugging §18k's new iOS CI
      job**: `gradlew` was tracked in git as mode `100644` (not executable) instead of `100755`,
      so every push/PR to `main` had actually been failing at the very first `./gradlew` call —
      confirmed via `gh run list` showing failures on the last several pushes, all with the same
      "Permission denied" error, unrelated to the missing secret. Fixed with
      `git update-index --chmod=+x gradlew`, committed directly to `main`. Both root causes are
      now resolved — CI is verified genuinely green, the first time this project's CI has
      actually passed.
- [x] Release signing wired: `release-keystore.jks` generated (`keytool`, RSA 2048, PKCS12, valid
      10000 days, alias `personalapp-release`) at the project root. `app/build.gradle.kts` reads
      the store path + passwords from `local.properties` (both gitignored — added `*.jks`/
      `*.keystore` to `.gitignore` too) and wires `signingConfigs.release`, applied to the
      `release` build type only when those properties are present (so a clone without them still
      gets an unsigned release build, no regression). **Verified: `./gradlew assembleRelease`
      succeeds and produces a signed `app-release.apk`.** This is an upload key for local/manual
      release builds — before actually publishing to Play Store, enroll in Play App Signing
      (Google holds the real app signing key; this becomes the upload key) and treat these
      generated passwords as placeholders to rotate, not final production secrets.
- [x] **Decided 2026-08-18: not publishing to the Play Store.** With a small client base, the
      user judged the ongoing overhead (Data Safety form, listing upkeep, review process) not
      worth it for now — distribution will be direct (sideloaded `app-release.apk`, e.g. shared
      link/file to each trainer's device) instead. This makes the remaining Play Store-specific
      prerequisites (app icon/screenshots sized for the Store listing, the Play Console "Data
      Safety" form) **not applicable, not just blocked** — dropping them, not deferring them.
      What's still genuinely useful regardless of distribution channel, already done:
      - [x] Release signing (see above) — sideloaded APKs still benefit from being signed
        consistently across updates, so Android treats each new version as an update rather than
        a conflicting reinstall.
      - [x] Privacy policy drafted: `store-listing/privacy-policy.md` — covers every data type the
        code actually collects (see the §2 table: auth, profile, `medicalNotes`, biometrics,
        workout logs, invite codes, AI keys, Crashlytics, App Check). Still worth keeping even
        without a Store listing, given the health data involved (LGPD Art. 5º sensitive-data
        category applies regardless of distribution channel) — just host it wherever's convenient
        (a simple webpage, a shared doc) instead of a Play Console-mandated URL, and treat it as a
        starting draft, not legal advice.
      - `store-listing/listing-copy.md` (title/description/category) is now moot — Play Store-only
        content, safe to ignore or delete whenever.

---

## 12. Phase 2 — full feature parity with commercial PT/coaching apps (researched, deliberately
deferred — not started, not blocking the MVP above)

Researched 2026-08-17 what personal-trainer client-management apps are expected to have today
(GetApp/Jotform/Capsule CRM/1fit market surveys — see sources at the end of this session's reply,
not reproduced here). Cross-referenced against this app's current + planned (§§1-11) scope:

| Commercial feature | This app's status |
|---|---|
| Client profiles + progress tracking | Have it (`BiometricEntity`/`WeightChart`, §4a sync) |
| Workout/program delivery | Have it (manual + AI builder, §5a) |
| Mobile access | Have it (native Android) |
| Booking with automatic reminders | Have scheduling (`ScheduleScreen`); **no reminders** — would need push notifications (FCM), explicitly out of scope per the original Product goal ("don't add FCM unless explicitly requested") |
| In-app messaging | **Don't have** — no chat/messaging feature or data model anywhere |
| Progress photos | **Don't have** — `BiometricEntity` is numeric only, no image storage/Firebase Storage integration |
| Payment processing | **Don't have** — no billing/subscription concept, no payment processor integration |
| Habit tracking | **Don't have** — out of scope, not part of the Product goal |

None of these are started, and none should be picked up silently — each is a real subsystem
(messaging needs a data model + real-time UI + likely FCM for delivery; payments need a processor
decision, PCI-scope discussion, and real business terms; photos need Firebase Storage + upload
UI + storage-rules; reminders need FCM). Flagging them here so the *complete* picture is visible,
per the request that triggered this research pass — not recommending building any of them without
an explicit go-ahead and, for payments specifically, real business decisions only the user can
make (pricing, which processor, subscription vs. one-time).

If/when any of these become real priorities, treat each as its own `/newgoal` research pass (the
depth needed — e.g. messaging's real-time delivery model, or payment PCI scope — deserves the same
front-loaded research this file already does for the rest of the app, not a rushed bolt-on).

---

## 13. Post-MVP Fixes & Validation (2026-08-19, via `/newgoal`)

Found via real-device testing (Samsung SM-S926B) after the MVP (§§0-11) and the trainer-request
flow addition were installed. Fix-type items: current (wrong) behavior → root cause → fix →
regression test, per `fix.md`'s discipline — a patch without a stated root cause isn't done.

```mermaid
flowchart TD
    A[13a. AI generation broken\nApp Check token invalid] --> D[Retest AI ficha generation]
    B[13b. ADM stats never refreshed] --> C[13c. Validate trainer-request flow end to end]
    E[13d. Invite claim fails once\na users doc already exists] --> C
    B --> D
```

**13a. AI ficha generation fails — "Firebase App Check token is invalid"**
- [x] **Repro:** on the installed debug build, `StudentDetailsScreen` → "Ficha Personal" → "Com IA"
      → send any message with the Gemini provider selected → reply is always `Erro ao chamar a
      IA: Firebase App Check token is invalid.` (confirmed via screenshot, 2026-08-19). OpenAI
      provider not yet retested against this same build — check both once the fix lands, since
      App Check protects Firestore/Auth too, not just the AI Logic call.
- [x] **Root cause — confirmed live via `adb logcat` 2026-08-19:** `MainApplication.kt` installs
      `DebugAppCheckProviderFactory` for any debuggable build (see §8's App Check item) — the
      sideloaded/`installDebug` APK on this phone is debuggable, so it generates a random **debug
      token**, logged on every app start:
      `DebugAppCheckProvider: Enter this debug secret into the allow list in the Firebase Console
      for your project: 1dce3124-8e1c-4fe8-9c25-1aa9be85ae4f`. §8 already flagged App Check
      enforcement itself as a pending manual step, but never called out this *separate*
      debug-token registration sub-step, which is required specifically for debug builds
      regardless of Play Integrity enforcement status. An unregistered debug token is rejected
      server-side as unrecognized/invalid — matching the exact error text seen.
- [x] **Fix — done 2026-08-19:** registered `1dce3124-8e1c-4fe8-9c25-1aa9be85ae4f` in Firebase
      Console → App Check → Apps → `com.example.personalapp` → ⋮ → Manage debug tokens → Add
      debug token → Salvar. The app showed as "Não registrado" with no attestation provider at
      all (the pending §8 manual step) — the debug-token action was still reachable directly from
      the row's ⋮ menu without registering Play Integrity first. Note for later: this token is
      tied to this specific app install; a fresh install (data wipe) or a different test device
      will need its own token registered the same way — worth documenting in a short "dev setup"
      note once there's more than one test device in rotation. Play Integrity itself is still
      "Não registrado" — that's the separate §8 item for real release-build attestation, not
      needed for debug-build testing.
- [x] **Regression test (manual) — passed 2026-08-19:** sent a real prompt from `AIWorkoutScreen`
      (Gemini) on the physical device. The `App Check token is invalid` error is gone — the call
      now reaches Gemini's backend for real, confirmed by a *different* error surfacing instead:
      `This model is currently experiencing high demand. Spikes in demand are usually temporary.
      Please try again later.` — a transient Gemini-side capacity response (HTTP 503-class,
      unrelated to App Check/auth), not a bug in this app. This is also the first live
      confirmation the Firebase AI Logic migration (§3) actually works end-to-end, which GOALS.md
      had flagged as unverified since it was written. Retry once demand clears; if it persists
      across many retries/hours, that would be worth a fresh look, but one instance is expected
      Gemini API behavior, not a regression.

**13b. ADM Gestão tab (trainer count, total users, pending requests) never refreshed after first
load — done 2026-08-19**
- [x] **Repro:** `AdminViewModel.loadUserStats()` and `loadTrainerRequests()` both ran exactly
      once, in `init{}`. Any Firestore change after the ViewModel was constructed (a new trainer
      promoted, a new `trainerRequests` doc written) never appeared in the Gestão tab without a
      full process kill + cold start — a same-session tab switch or even backgrounding/resuming
      the app wasn't enough, since the `ViewModel` instance (and its `StateFlow`s) survives that.
      This is exactly why "Personais: 0" stayed stuck even with an active Trainer already using
      the app, and why a submitted trainer-access request didn't show up in "Solicitações
      Pendentes".
- [x] **Root cause:** one-shot `.get()` Firestore reads in `init{}` with no listener and no
      re-trigger path anywhere in the UI layer — not a data problem, a missing-refresh problem.
- [x] **Fix:** made `loadUserStats()`/`loadTrainerRequests()` public on `AdminViewModel`; call
      both from a `LaunchedEffect(Unit)` in `UserManagementTab` (`AdminDashboardScreen.kt`) —
      re-runs every time this composable re-enters composition, i.e. every time the Gestão tab is
      selected, no extra state needed. Added a manual refresh `IconButton` next to "Solicitações
      Pendentes" for an on-demand recheck without leaving the tab.
- [x] **Regression test (manual) — passed 2026-08-20:** on-device, `alexmiguel011014@gmail.com`
      tapped "Solicitar acesso de Trainer" while the ADM's Gestão tab was already open in the
      background; switching back to the tab showed the new pending request without restarting the
      app. Confirms the `LaunchedEffect(Unit)` re-trigger fix works for real, not just compiles.

**13d. Claiming an invite permanently fails once a `users/{uid}` doc exists for that account —
found 2026-08-19 (`alexmiguel011014@gmail.com`), worked around manually, needs a real fix**
- [x] **Repro:** on `LoginScreen`, an authenticated account with an existing `users/{uid}` Firestore
      doc enters a trainer-minted invite code → claim silently fails (Firestore
      `PERMISSION_DENIED`, surfaced to the user as the raw exception string, not a helpful
      message). Confirmed live 2026-08-19. Two distinct starting states both reach this same dead
      end, and are worth telling apart because only one has a safe automatic fix:
      1. **Genuinely-unclaimed STUDENT** (`role: STUDENT`, `trainerId: null`) — e.g. an account
         previously promoted/rejected through some other admin action that still left a doc
         behind, or any future path that writes a `users/{uid}` doc before the invite is claimed.
         *Checked against the code: today's plain self-registration (`AuthRepository.register()` →
         `login()`) does **not** itself write a `users/{uid}` doc — a purely-registered,
         never-touched account is still doc-less and claims fine via the existing `create` rule.
         This case matters for any account that picked up a doc some other way (see case 2, or a
         future flow) while still logically "unclaimed".*
      2. **Account already has an incompatible role** — most likely what actually happened to
         `alexmiguel011014@gmail.com`: earlier in this same session it was used to test the
         ADM's "Promover manualmente" UID-paste form (`AdminViewModel.promoteToTrainer()`, a
         `SetOptions.merge()` write setting `role: TRAINER`), which — like the working fix in
         13b/13c — creates a real `users/{uid}` doc with `role: TRAINER`. Reusing that same
         account as a STUDENT then hits a doc that already has an unrelated role. **This case
         should not be silently auto-resolved** — a STUDENT invite claim silently overwriting an
         existing TRAINER doc would be a real privilege/data-loss bug, not a fix.
- [x] **Root cause:** `AuthRepository.claimInvite()` always does a plain
      `transaction.set(userRef, mapOf(role="STUDENT", trainerId=<real>, ...))` with no branch for
      "does this uid already have a doc, and if so, what's actually in it". Firestore evaluates
      any write to an existing doc as `update`, and `firestore.rules`' `update` rule requires
      `role`/`trainerId` to stay byte-identical to `resource.data` (the anti-self-promotion
      guarantee) — with no exception carved out for the one legitimate case (1) where changing
      `trainerId` from `null` is exactly what should be allowed. Compounding this: `claimInvite()`'s
      caller (`AuthViewModel.claimInvite()`, `AuthViewModel.kt:110-112`) surfaces the raw Firebase
      exception message on failure (`e.message ?: "Código inválido"`) — for a rules rejection this
      is an opaque `PERMISSION_DENIED` string, giving no hint that the real problem is "this
      account already has a role" vs. any other reason the code could be rejected.
- [x] **Fix — two parts (implemented 2026-08-19, not yet republished to the live Console):**
      1. **`firestore.rules`**, `users/{uid}` `allow update`: add a narrow exception, additive to
         the existing unchanged-fields check, covering *only* case 1 above (existing role is
         already `STUDENT` **and** existing `trainerId` is `null`) — presenting the same
         currently-valid/unused-invite proof the `create` rule already requires:
         ```
         allow update: if isAdmin() || (
           isSignedIn() && request.auth.uid == uid &&
           (
             (
               field(request.resource.data, 'role') == field(resource.data, 'role') &&
               field(request.resource.data, 'trainerId') == field(resource.data, 'trainerId')
             ) ||
             (
               field(resource.data, 'role') == 'STUDENT' &&
               field(resource.data, 'trainerId') == null &&
               request.resource.data.role == 'STUDENT' &&
               request.resource.data.trainerId ==
                 get(/databases/$(database)/documents/invites/$(request.resource.data.inviteCode)).data.trainerId &&
               get(/databases/$(database)/documents/invites/$(request.resource.data.inviteCode)).data.used == false
             )
           )
         );
         ```
         Case 2 (already `TRAINER`/`ADM`, or already linked to a different trainer) deliberately
         stays blocked — that's correct behavior, not a bug, and needs an explicit ADM decision
         (demote/unlink first), not a client-driven overwrite.
      2. **UX for case 2, `AuthViewModel.claimInvite()`:** catch a Firestore
         `PERMISSION_DENIED`/`FirebaseFirestoreException` specifically and map it to a clear
         message (e.g. "Esta conta já está vinculada a um perfil existente — fale com o
         administrador.") instead of forwarding the raw exception text, so this doesn't require a
         support conversation + manual Console lookup to diagnose next time.
- [x] **Regression test (manual) — case 1 passed 2026-08-20; case 2 accepted as UI-unreachable
      (see below).**
      1. **Case 1 — passed.** Registered a fresh test account (`teste@teste.com`), manually created
         its `users/{uid}` doc (`role: STUDENT, trainerId: null`, simulating a path that leaves an
         unclaimed doc behind), had a trainer (`alexmiguel011014@gmail.com`) generate an invite,
         claimed it from the test account — confirmed success, `RoleRouter` routed into
         `StudentNavigation` (verified on-device: "Treinos"/"Evolução" tabs, "Nenhuma ficha
         atribuída ainda"). **Real deployment bug found and fixed along the way, not a code bug**:
         the first claim attempt failed with the exact pre-fix "already linked" error even though
         the local `firestore.rules` file had the §13d exception. Root cause: the rules **published
         on the live Firebase Console were stale** — an older version without the §13d `update`
         exception (confirmed by having the user paste the live rules text back for comparison).
         The user had believed this was already republished (see the "13b/13c" pass), but it
         hadn't actually gone out. Republishing the current local file fixed it immediately — no
         code change needed. **Process takeaway**: after any `firestore.rules` edit, verify what's
         *live* by reading it back from the Console, don't just trust "I published it" from memory
         — this cost real debugging time chasing a phantom code bug that didn't exist.
      2. **Case 2 — accepted as structurally unreachable via the UI, not hands-on tested.** Traced
         `RoleRouter`: an account with an existing role (`TRAINER`, or already-linked `STUDENT`)
         never reaches the invite-claim screen at all — it's routed straight into
         `AppNavigation`/`StudentNavigation` instead. The rule is defense-in-depth against a direct
         API/DB write, not something a normal user flow can trigger, so a click-through regression
         test isn't structurally possible without a raw authenticated Firestore call outside the
         app. User decision: accept this as covered by code review + UI routing, skip the extra
         verification step.
      - **Two unrelated real bugs surfaced during this test pass — both fixed and verified
        on-device 2026-08-21:**
        1. `TrainerRepository`'s `users where trainerId==X and role==STUDENT` listener query
           (the §7 "unify" model's linked-student sync) failed with `PERMISSION_DENIED` — confirmed
           live via logcat (`Listen for QueryWrapper(...) failed: Status{code=PERMISSION_DENIED}`).
           `firestore.rules`' `users/{uid}` collection only allowed self-read or `isAdmin()` — no
           rule let a trainer read/list their own linked students' `users/{uid}` docs, so the
           "linked student" half of the §7 unify model had never actually synced into a trainer's
           `Meus Alunos` list. **Fixed**: added `isOwningTrainer(field(resource.data, 'trainerId'))`
           to the `users/{uid}` `allow read` rule, republished. **Verified on-device**: after the
           fix, `alexmiguel011014@gmail.com`'s "Meus Alunos" correctly showed *two* cards (the
           original `students/` draft + the newly-linked `users/` account from the 13d case-1
           test) — before the fix only the draft ever appeared.
        2. The Trainer's main screen (`MainScreen`/students list) had **no logout button** — found
           when trying to switch test accounts, had to force-close the app instead. **Fixed**:
           added a logout `IconButton` (`Icons.AutoMirrored.Filled.Logout`) to `MainScreen`'s
           `TopAppBar`, threaded `onLogout` through `AppNavigation()` from `RoleRouter` (same
           `viewModel.logout()` pattern already used for ADM/Student). **Verified on-device**:
           tapping it returns to `LoginScreen` cleanly.
        Both changes verified via `./gradlew compileDebugKotlin verify assembleDebug` (all green)
        before on-device testing.

**13c. Trainer-request flow (`trainerRequests`) — end-to-end validation — done 2026-08-20**
- [x] `firestore.rules`' `trainerRequests/{uid}` block was republished in the Firebase Console
      (user-confirmed 2026-08-19) and no `PERMISSION_DENIED` was seen in logcat afterward — the
      rules side is live. Full pass confirmed on-device 2026-08-20:
      `alexmiguel011014@gmail.com` (a STUDENT account) tapped "Solicitar acesso de Trainer" on
      `LoginScreen`, the request appeared live in the ADM's "Solicitações Pendentes" (see 13b),
      "Aceitar" promoted it to TRAINER. The whole trainer-onboarding feature (GOALS.md's "Post-MVP
      addition") is now verified end-to-end, not just "compiles and rules are live". Side effect
      worth noting: this reused `alexmiguel011014@gmail.com` as the test account, so it's now a
      real TRAINER — no longer available as a clean unclaimed-STUDENT fixture for 13d below, which
      needs a fresh account instead.

---

## 14. Research — cost-effective AI providers for a future constraint-aware ficha generator
(2026-08-19, via `/newgoal /repertoire`)

Feeds §15 below only for its *future* phase (real in-app AI re-integration) — §15's immediate
deliverable (the prompt-template + paste flow) ships regardless of this section and needs no AI
API of its own. Domain grounding: see `REPERTOIRE.md` (scientific + competitive-landscape lenses).

```mermaid
flowchart TD
    A[14a. Why Gemini is unreliable\nright now - confirmed] --> B[14b. Cheap-provider comparison]
    B --> C[14c. Recommendation for\na future phase-2 integration]
```

**14a. Why the Gemini errors are real and external, not a bug in this app**
- The `App Check token is invalid` error (§13a) was this app's own bug, now fixed. The `This
  model is currently experiencing high demand` error reported afterward (2026-08-19) is a
  **separate, well-documented, industry-wide problem with Gemini's free/Developer API tier**,
  not something fixable in this codebase: Google cut the Gemini API free-tier quota by 50-92%
  on 2025-12-07, and a further wave of "model overloaded" errors was widely reported starting
  2026-01-16. This app's Firebase AI Logic integration (§3) uses exactly this free
  "Gemini Developer API" tier by design (the whole point of the §3 migration was staying on
  Firebase's free Spark plan). **The user's instinct to not trust Gemini here going forward is
  correct, not overly cautious** — this isn't a transient blip to wait out, it's the tier's
  current normal operating condition.

**14b. Cheap-provider landscape (pricing, structured-output support, reliability notes)**

| Provider / model | Price (in/out per 1M tokens) | Structured JSON output | Notes |
|---|---|---|---|
| Gemini 2.5 Flash-Lite (free Developer tier, current integration) | $0.10 / $0.40 (paid tier; free tier is what's failing) | Yes | Cheapest Google option, but the free tier is exactly what's currently unreliable (14a) — a **paid** Gemini tier might sidestep this, but that reopens the Blaze-plan decision §3 deliberately avoided. |
| **GPT-5 Nano (OpenAI)** | ~$0.05 / — (cheapest OpenAI tier) | Yes (`response_format`) | **This app already has a working OpenAI HTTP integration** (`GenerativeAiService.generateWithOpenAi()`, `api.openai.com/v1/chat/completions`) — currently pointed at `gpt-4o-mini` (GOALS.md §5e), which is no longer the cheapest/current option. Switching the model string is near-zero engineering cost. |
| DeepSeek V3.2 / V4 Flash | $0.14 / $0.28 | Yes (`json_object` mode) | Cheapest true frontier-quality option. Real caveat found: DeepSeek's own API has **its own documented uptime fluctuations under peak demand** — the standard industry mitigation is a multi-provider fallback, i.e. the same class of risk this section exists to get away from, not a strictly safer bet than Gemini. Would need a brand-new HTTP integration (no existing code path, unlike OpenAI). |
| Claude Haiku 4.5 (Anthropic) | $1 / $5 | Yes (tool-use/structured mode) | Pricier than the above, but Anthropic models have a strong instruction-following reputation (relevant given the volume-budget math in `REPERTOIRE.md` needs to be followed *exactly*, not approximately). No existing integration in this app — would need a new HTTP client, same lift as DeepSeek. |

**14c. Recommendation for a future phase-2 — superseded 2026-08-19 by the user's explicit choice
(see §16): give the trainer all four providers now rather than wait-and-see on just one.**
- [x] ~~Cheapest path to re-enable in-app AI with real reliability: point the already-wired OpenAI
      integration at a current cheap model before building a new provider integration.~~
      Superseded — §16 builds DeepSeek and Claude now regardless, per explicit user direction.
      The underlying cost point still stands (OpenAI's `gpt-4o-mini` model id in
      `GenerativeAiService` is stale — worth a follow-up bump to a current cheap model, tracked
      informally here, not urgent enough for its own numbered item).
- [x] ~~Only build a DeepSeek/new-provider integration if a real evaluation shows the cheap-OpenAI
      path isn't accurate enough.~~ Superseded — built directly in §16, not gated on an
      evaluation. The evaluation itself is still worth doing eventually (which provider actually
      follows the volume-budget math best), just informally, whenever real usage accumulates —
      not a blocker for shipping the choice.
- [ ] Keep Gemini wired as an optional fallback (§3's existing code), but stop treating it as the
      default/primary path in any UI copy until Google's free-tier reliability changes — still
      accurate advice, unaffected by the §16 expansion (Gemini stays one of four choices, just
      not the one to lead with in copy/defaults).

---

## 15. Feature — replace in-app AI ficha generation with a prompt-template + paste workflow
(2026-08-19, via `/newgoal`)

The immediate, ship-now response to §14a: stop depending on a live in-app AI call for ficha
generation. Instead, give the trainer a pre-written formatting prompt (authored once, embedded in
the app) that they combine with their own requirements and run in *whatever* AI app they already
have (ChatGPT, Gemini app, Claude, web — doesn't matter, no API integration needed for this to
work) — then paste the reply back into the app's existing Smart Paste importer, extended to also
parse the muscle-activation annotations `REPERTOIRE.md` validated. The trainer keeps 100% manual
edit control afterward — nothing new needed there, `ManualWorkoutScreen`'s existing exercise-list
editing already applies to imported fichas exactly like manually-typed ones.

```mermaid
flowchart TD
    A[15a. Design: template shape\n+ output format spec] --> B[15b. Formatting prompt asset]
    B --> C[15c. WorkoutParser: parse\nmuscle-activation annotations]
    C --> D[15d. Effective-volume calculator\n+ display]
    A --> E[15e. PromptFichaScreen:\ncopy-prompt + paste-back UI]
    E --> D
    D --> F[15f. Tests]
    F --> G[15g. Registration: rewire\nthe two existing AI entry points]
```

**15a. Design rationale**
- [x] **Output format**: extend, don't replace, the existing Smart Paste shape (`WorkoutParser.kt`
      — `Ficha X` header line + `Exercício NxM` lines, GOALS.md's own module docs) with an
      *optional* trailing annotation per exercise line naming which muscles it hits and at what
      coefficient from `hypertrophy_volume_reference.md`, e.g.:
      `Supino reto 4x10 [Peitoral:1.0, Delt.ant:0.5, Tríceps:0.5]`
      Optional so a line with no annotation (or a human pasting a plain WhatsApp-style ficha,
      today's existing use case) still parses exactly as before — this is additive, not a
      breaking format change.
- [x] **Explicit out of scope for this pass** (prevents scope creep): no new in-app AI API call
      (that's §14's later phase, if ever); no anatomy-diagram/heatmap visualization (Hevy/Boostcamp
      style, per `REPERTOIRE.md` §2) — this pass shows effective volume as a simple per-muscle
      number-vs-band line, not a body diagram; no change to `AIWorkoutViewModel`'s JSON-based
      direct-call contract — that code stays as-is, just unwired from the primary UI path (§14c
      keeps the door open to re-enable it later without a rewrite).

**15b. Formatting-prompt asset**
- [x] New asset `app/src/main/assets/ficha_prompt_template.md` — the fixed prompt text the app
      hands the trainer, containing: (1) the exact output format spec from 15a with a worked
      example, (2) the full `hypertrophy_volume_reference.md` table content (reused verbatim —
      already bundled, no duplication of research), (3) an instruction to compute and report
      effective volume per targeted muscle as `Σ(sets × coefficient)` against whatever weekly
      target the trainer states, applying the existing RIR adjustment rules from the same table —
      this is the exact validated method from `REPERTOIRE.md` §1, written into the prompt as
      plain instructions so any general-purpose AI (not just Gemini) can follow it.

**15c. `WorkoutParser.kt` — parse the muscle-activation annotation**
- [x] New regex for the optional trailing `[Muscle:coef, Muscle:coef, ...]` block per exercise
      line, parsed into a `Map<String, Double>` on the exercise (nullable/empty when absent —
      backward compatible with every existing `WorkoutParserTest` case, which must keep passing
      unchanged).

**15d. Effective-volume calculator + display**
- [x] New pure function: given a parsed ficha's exercises (sets × per-muscle coefficients), sum
      `sets × coefficient` per muscle across the whole ficha → effective weekly volume per muscle.
      Display as a compact per-muscle line (muscle name, computed number, generic MEV/MAV/MRV band
      as context text, per `REPERTOIRE.md` §2's finding that a bare number without a
      range/context is the wrong UX) — added to the ficha view already shown on
      `ManualWorkoutScreen`/`StudentDetailsScreen`, not a new screen.

**15e. `PromptFichaScreen` — copy-prompt + paste-back UI**
- [x] New screen (or a new mode on the existing `AIWorkoutScreen`, reusing its student-profile
      auto-fill from `buildPrompt()`'s existing field-gathering logic): a text field for the
      trainer's own requirements (what they want in the ficha, target volumes per muscle, etc.),
      a **"Copiar Prompt"** button that concatenates 15b's template + the student's existing
      profile fields + this free text, and copies it to the clipboard (`ClipboardManager`, same
      API already used for the invite-code share sheet) — then the existing "Importador
      Inteligente" paste box (already on `ManualWorkoutScreen`) is where the trainer pastes the
      AI's reply back in. No new paste UI needed, just the "Copiar Prompt" half.

**15f. Tests**
- [x] `WorkoutParserTest`: new cases for the muscle-activation annotation (present, absent,
      malformed — skipped, not errored, same convention as every other unparseable line today).
      Found and fixed a real bug while writing these: a comma-decimal coefficient (e.g.
      `[Costas:0,75]`) silently parsed wrong (comma also separates muscles in the same bracket) —
      the annotation format now requires a period, documented in the prompt template and in a
      code comment, not just fixed silently.
- [x] New unit test for the effective-volume calculator: multiple exercises contributing
      fractional credit to the same muscle sum correctly; a muscle with zero contributing
      exercises reports 0, not a crash.
- [ ] **(manual)** confirm "Copiar Prompt" actually populates the system clipboard on a real
      device — Compose clipboard interaction isn't meaningfully covered by a JVM/Robolectric test.

**15g. Registration — rewire the two existing AI entry points**
- [x] `StudentDetailsScreen`'s "Ficha Personal" dialog ("Manual" vs. "Com IA") and
      `WorkoutBuilderScreen`'s "Criar com IA" button both currently navigate straight to
      `AIWorkoutScreen` (the live-chat direct-call screen, GOALS.md §5d) — repoint both at the new
      `PromptFichaScreen` instead. Done when: neither entry point reaches a live Gemini/OpenAI API
      call without the trainer explicitly choosing to (§14c keeps that path available, just not
      the default one a tap away).

---

## 16. Feature — DeepSeek + Claude as selectable providers, dedicated Settings tabs
(2026-08-19, via `/newgoal`)

Supersedes part of §15g: the user's direction here is to *expand* the direct in-app AI path
(more provider choice), not fully retire it in favor of §15's prompt-and-paste flow — both now
coexist as first-class options (see 16a). Grounds provider specifics in real API docs (endpoint,
auth header, request/response shape) so `/execgoals` implements against a checked spec, not a
guess — DeepSeek and Claude have genuinely different wire formats from each other, this matters.

```mermaid
flowchart TD
    A[16a. Design: keep both AI\npaths, tabbed Settings shape] --> B[16b. SettingsRepository/VM:\nnew key fields]
    A --> E[16d. AIWorkoutScreen:\n4 provider chips]
    B --> C[16c. GenerativeAiService:\nDeepSeek + Claude calls]
    C --> E
    B --> F[16e. Settings screen\ntabbed rebuild]
    C --> G[16f. Tests]
    E --> H[16g. Registration:\nentry-point dialogs]
    F --> H
```

**16a. Design rationale**
- [x] **Amend §15g**: don't hide `AIWorkoutScreen` behind `PromptFichaScreen` — keep both reachable.
      The "Ficha Personal" dialog (`StudentDetailsScreen`) and `WorkoutBuilderScreen`'s "Criar com
      IA" now offer a choice between **"IA no app"** (`AIWorkoutScreen`, direct call, now 4
      providers to pick from) and **"Prompt para IA externa"** (§15's `PromptFichaScreen`) —
      giving the trainer a live in-app fallback *and* a fully external option, not forcing one.
- [x] **`AiProvider` enum expands**: `GEMINI, OPENAI, DEEPSEEK, CLAUDE`. Gemini stays the only
      project-level/free provider (Firebase AI Logic, §3); the other three are all
      **BYO-key**, exactly the pattern OpenAI already established — no new architecture, just two
      more branches of something that already works.
- [x] **Settings becomes tabbed**, reusing the `NavigationBar` + `selectedTab` pattern already
      proven in `AdminDashboardScreen` (§5e) for consistency rather than inventing a second
      "sectioned screen" convention in the same app. Starts with **one tab, "IA"**, holding
      everything AI-related (Gemini's status card + three BYO-key fields). Adding a future
      settings category later is one more entry in the tab list + one more `when` branch — no
      rearchitecture needed when that day comes, which is the actual ask ("já começa a organizar
      melhor").

**16b. `SettingsRepository`/`SettingsViewModel` — new key storage**
- [x] Mirror the existing `openaiApiKey` pattern exactly: two new `stringPreferencesKey`s
      (`deepseek_api_key`, `claude_api_key`) in `SettingsRepository`, two new `Flow<String>`
      exposures + `saveXApiKey()` functions, surfaced on `SettingsViewModel` the same way
      `openaiApiKey`/`saveOpenaiApiKey` already are.

**16c. `GenerativeAiService` — DeepSeek and Claude calls**
- [x] **DeepSeek — reuses the existing OpenAI request/response classes verbatim.** DeepSeek's API
      is explicitly OpenAI-wire-format-compatible (confirmed via current API docs,
      `api-docs.deepseek.com`): same `Authorization: Bearer <key>` header, same
      `{"model": ..., "messages": [{"role", "content"}]}` request shape, same
      `{"choices": [{"message": {"content"}}]}` response shape already modeled by
      `OpenAiChatRequest`/`OpenAiChatResponse`. Only two things differ from the existing
      `generateWithOpenAi()`: base URL `https://api.deepseek.com/chat/completions` and model id
      `deepseek-chat` (current general-purpose alias; `deepseek-v4-flash`/`deepseek-v4-pro` also
      exist per §14b's pricing research — verify which is current/recommended at implementation
      time, same staleness caveat already written for `GEMINI_MODEL_ID`). Read the key from
      `settingsRepository.deepseekApiKey`, same blank-key-check/error-string convention as OpenAI.
- [x] **Claude — new request/response shape, NOT OpenAI-compatible.** Anthropic's Messages API:
      `POST https://api.anthropic.com/v1/messages`. Headers: `x-api-key: <key>` (not
      `Authorization: Bearer`), `anthropic-version: 2023-06-01` (a stable API-version string,
      unrelated to model version — do not confuse the two), `Content-Type: application/json`.
      Body: `{"model": "claude-haiku-4-5", "max_tokens": 4096, "messages": [{"role": "user",
      "content": fullPrompt}]}`. Response: `{"content": [{"type": "text", "text": "..."}]}` (a
      list of content blocks, not a single string — take the first `text`-type block). New
      `@Serializable` classes needed: `ClaudeMessageRequest(model, maxTokens, messages)`,
      `ClaudeMessage(role, content)`, `ClaudeResponse(content: List<ClaudeContentBlock>)`,
      `ClaudeContentBlock(type, text)` — same `HttpURLConnection` + `kotlinx.serialization`
      pattern already used for OpenAI, no new HTTP dependency. Read the key from
      `settingsRepository.claudeApiKey`.
- [x] Both new branches follow the exact error-handling shape `generateWithOpenAi()` already
      established: blank-key check returns a clear Portuguese error string before making any
      network call, non-2xx response passes the body through in the error string (not a generic
      "failed"), and `FirebaseCrashlytics.getInstance().recordException(e)` on any thrown
      exception — consistency with the one pattern this file already got right, not a new style.

**16d. `AIWorkoutScreen` — four provider chips**
- [x] Extend the existing `FilterChip` row (currently Gemini/ChatGPT only) with "DeepSeek" and
      "Claude" chips, same `provider by remember { mutableStateOf(...) }` selection pattern.

**16e. Settings screen — tabbed rebuild**
- [x] Rebuild `SettingsScreen` per 16a's tab shape (`NavigationBar` with one "IA" tab today).
      Inside the IA tab: keep the existing Gemini info card unchanged, and one `OutlinedTextField`
      + `PasswordVisualTransformation` per BYO-key provider (OpenAI, DeepSeek, Claude) — **one
      shared "Salvar" action saving all three at once** (cheaper than three separate FABs/buttons
      for what's functionally one form), matching the existing single-FAB pattern but extended to
      write all three keys together.

**16f. Tests**
- [x] **Descoped, reasoning recorded 2026-08-19**: a real `GenerativeAiServiceTest` would need
      either a new test dependency (MockWebServer — this project has consistently avoided adding
      an HTTP test/client dependency for a single POST call, same reasoning that kept OpenAI on
      plain `HttpURLConnection` in the first place) or loosening the request/response data
      classes from `private` to something a same-package test file could reach — neither is
      proportionate to add just for this. Consistent with the existing gap: `generateWithOpenAi()`
      itself has never had a unit test either, so this isn't a new hole, just staying honest about
      an old one. Verification for all three BYO-key providers stays manual — plug in a real key
      and send one message from `AIWorkoutScreen`, same as how OpenAI has always been checked.

**16g. Registration**
- [x] Update the "Ficha Personal" dialog (`StudentDetailsScreen`) and `WorkoutBuilderScreen`'s
      "Criar com IA" entry point per 16a's amended design (choice between `AIWorkoutScreen` and
      `PromptFichaScreen`, not just the latter as §15g originally specified).

---

## 17. Feature — student connection clarity, trainer-granted permissions, self-assessment
(2026-08-19, via `/newgoal`)

**Not yet started — the user flagged this as a real gap but was explicitly unsure whether now is
the right time to build it ("não sei se agora é o melhor momento"). This section is the plan for
when they decide to; running `/execgoals` against it is a separate, later decision, not implied by
writing it.**

Grounded in a direct code read (not assumption) before designing anything, since the request
questioned whether the current model is architecturally broken:

- **"Meus Alunos" already merges both states** — `TrainerRepository.getStudents()` reads one Room
  `users` table populated by *two* Firestore listeners: `students/{id}` drafts (`AddStudentScreen`,
  no Firebase Auth account) and `users/{uid}` docs where `trainerId` matches (real linked/claimed
  accounts). A trainer already sees both kinds of "aluno" in one list — the data layer isn't
  fragmented. What's actually missing is **visual distinction on the card** between "cadastrado,
  ainda não conectado" and "conectado" — a UI gap, not an architecture one.
- **`AddStudentScreen` should stay** — it's the same pattern real competing tools use (Trainerize,
  TrueCoach: "add a client record" and "invite them to the app" are two separate, sequential
  steps, not one). A trainer meeting a new client in person, before that person has installed
  anything, needs somewhere to write down what they already know. Removing it would regress a
  real, common workflow to solve a labeling problem — fix the label, not the feature.
- **Real bug found while reading `AuthRepository.claimInvite()` for this pass**: the claim write
  is `transaction.set(userRef, mapOf(...))` — a full overwrite, not a merge. Harmless *today*
  (nothing lets an unclaimed self-registered STUDENT write anything to their own profile yet, per
  the code read), but it becomes a real data-loss bug the moment any self-service capability
  ships: a student who filled out a self-assessment (17e) *before* claiming an invite would have
  it silently wiped the moment they claim. Rather than touch the claim mechanism (out of scope,
  risk of regressing §7/§13d's already-working invite logic), **every new self-service capability
  in this section is scoped to apply only to already-linked (claimed) students** — matches the
  user's own framing ("aluno... conectar para o personal e aí sim [fazer coisas]") and sidesteps
  the overwrite risk entirely rather than papering over it.

```mermaid
flowchart TD
    A[17a. Design: draft/connected\nbadge, permission set, self-\nassessment as time-series] --> B[17b. Data model:\nassessments + permission fields]
    B --> C[17c. firestore.rules]
    C --> D[17d. Trainer UI:\nbadge, toggles, request, history]
    C --> E[17e. Student UI:\ngated tabs, assessment form]
    D --> F[17f. Tests]
    E --> F
    F --> G[17g. Registration]
```

**17a. Design rationale**
- [ ] **Draft vs. connected badge**: purely visual, uses the existing `UserEntity.linked` field
      already returned by the merged query — no new data needed. Closes the actual confusion the
      user flagged without touching the data model.
- [ ] **Permission set stays small and named, not a generic feature-flag framework**: exactly two
      toggles, both trainer-controlled and default OFF (per "que o personal libera... quando
      personal autorizar"):
      - `canSelfAssess` — student may fill out a self-assessment when the trainer requests one.
      - `canLogBiometrics` — student may log their own weight/measurements (distinct from the
        trainer's own biometric entries on `StudentDetailsScreen`).
      A third or fourth toggle can be added later the same way if a real need shows up — building
      a generic per-feature permission engine now for two known toggles is speculative flexibility
      this project's own conventions already avoid elsewhere.
- [ ] **Self-assessment is a time-series collection (`assessments/{id}`), not a single overwritable
      profile field** — mirrors the existing `biometrics`/`workoutLogs` pattern (Firestore source
      of truth + Room mirror), giving the trainer a real history instead of only ever seeing the
      latest answers. Content grounded in the **PAR-Q+** (Physical Activity Readiness
      Questionnaire), the international-standard pre-exercise health screening tool used
      industry-wide before a new client starts training — 7 general yes/no health-risk questions
      (heart condition needing medical clearance, chest pain during/at rest, dizziness or loss of
      consciousness, a bone/joint problem, current blood-pressure/heart medication, any other
      medical reason) — plus the profile fields `UserEntity` already has (`goal`,
      `experienceLevel`, `trainingDays`), not an invented bespoke form. A "yes" answer should be
      flagged visibly to the trainer (liability/safety relevance), not just logged silently.
- [ ] **Request is pull-based, not push** — the trainer "requesting" an assessment just flips
      `pendingAssessmentRequest = true` on the student's own doc; the student sees it next time
      they open the app (same pattern already used for role-promotion — GOALS.md explicitly keeps
      push notifications/FCM out of scope project-wide). No new messaging infrastructure needed.

**17b. Data model**
- [ ] New Room entity `AssessmentEntity` + Firestore collection `assessments/{id}`:
      `studentId`, `trainerId`, `requestedAt`, `submittedAt` (null until answered), `parQAnswers`
      (map of question key → boolean), `goal`/`experienceLevel`/`trainingDays` snapshot at
      submission time (so history reflects what was true *then*, not the current live profile).
      Room migration (schema version bump, exported schema committed under `app/schemas/`, per
      CLAUDE.md's own convention — no `fallbackToDestructiveMigration` reliance).
- [ ] New fields on `UserEntity`/`users/{uid}`: `canSelfAssess: Boolean = false`,
      `canLogBiometrics: Boolean = false`, `pendingAssessmentRequest: Boolean = false`. Extend
      `FirestoreMappers.kt` (`toFirestoreMap()`/`toUserEntity()`) — same three-places-in-lockstep
      rule CLAUDE.md already documents for this data layer.
- [ ] `TrainerRepository`: `requestAssessment(studentId)` (sets the pending flag),
      `getAssessmentsForStudent(studentId): Flow<List<AssessmentEntity>>`,
      `setStudentPermission(studentId, canSelfAssess, canLogBiometrics)`.
- [ ] `StudentRepository`: `submitAssessment(answers, profileSnapshot)` (writes the doc, clears
      the pending flag), `logOwnBiometric(entry)` (only meaningful when `canLogBiometrics` is
      true — the rule in 17c is the real gate, this is just the write path).

**17c. `firestore.rules`**
- [ ] `assessments/{id}`: `allow create` if `isOwningTrainer(request.resource.data.trainerId)`
      (the request) **or** if the caller is the student themselves, `request.resource.data.studentId
      == request.auth.uid`, and their own `users/{uid}.canSelfAssess == true` (the submission —
      same `get()`-a-related-doc pattern already used for invite validation). `allow read` if
      owning trainer or the student themselves (same shape as `workoutLogs`).
- [ ] `users/{uid}` self-`update`: add one more narrow, additive exception (same style as §13d's
      re-claim exception) permitting `pendingAssessmentRequest` to change **only** `true → false`
      and **only** as part of the same write that creates an `assessments/{id}` doc for that
      student — this is the "submitting an assessment clears its own pending flag" self-write,
      distinct from `canSelfAssess`/`canLogBiometrics` themselves, which stay trainer-only
      (`isAdmin() || isOwningTrainer(...)`), never student-settable.
- [ ] `biometrics/{entryId}` `allow create`: add a narrow exception permitting a student to create
      their own entry (`request.resource.data.studentId == request.auth.uid`) only when their own
      `users/{uid}.canLogBiometrics == true` — additive to the existing `isOwningTrainer`-only
      create rule, not a replacement.

**17d. Trainer-side UI**
- [ ] Student list/card (`StudentsScreen`/`MainScreen`): a small badge — "Conectado" vs
      "Cadastrado (aguardando conexão)" — driven by the existing `linked` field.
- [ ] `StudentDetailsScreen`: new "Permissões" section with two switches
      (`canSelfAssess`/`canLogBiometrics`), a "Solicitar Autoavaliação" button (enabled only when
      `canSelfAssess` is already on — request presupposes permission, not the other way around),
      and an assessment-history list (newest first, flags any "yes" PAR-Q answer visibly).

**17e. Student-side UI**
- [ ] `StudentNavigation`: reads the student's own `canSelfAssess`/`canLogBiometrics` from their
      already-synced profile (via `StudentRepository`'s existing listener, no new sync mechanism)
      and conditionally shows the corresponding tab/action — hidden entirely, not just disabled,
      when the trainer hasn't granted it.
- [ ] Pending-assessment banner/screen: when `pendingAssessmentRequest == true`, show the PAR-Q
      questions (pre-filled `goal`/`experienceLevel`/`trainingDays` from the current profile,
      editable) → submit writes `assessments/{id}` + clears the pending flag in the same logical
      action (17c's rule requires this).
- [ ] Self-log biometrics screen: reuses the existing `WeightChart`/biometric-entry UI pattern
      already built for the trainer side (`StudentDetailsScreen`/`Components.kt`) rather than
      building a second one — same component, a student-facing write path gated by 17c's rule.

**17f. Tests**
- [ ] Room DAO test for `AssessmentEntity` CRUD + the new migration (same in-memory-DB pattern
      `AppDaoTest` already uses — note the existing caveat: written and compiling is verifiable
      here, actually *running* needs a device/emulator, same as every other `androidTest` in this
      project).
- [ ] **(manual)** `firestore.rules` changes always need live verification after publishing — this
      is no different from every other rules change this session: publish, then confirm both the
      trainer-request path and the student-submit path actually work, and that a `canSelfAssess ==
      false` student is genuinely blocked (not just hidden in the UI) from creating an
      `assessments/{id}` doc directly.

**17g. Registration**
- [ ] Wire the new "Permissões"/assessment-history section into `StudentDetailsScreen`'s existing
      layout (not a new top-level screen — it belongs alongside the other per-student management
      already there). Wire the new student-side screens into `StudentNavigation`'s existing tab
      list, conditionally per 17e.

---

## 18. Build — Cross-platform: bring the app to iOS via Kotlin Multiplatform
(2026-08-21, via `/newgoal /repertoire`)

The single biggest architecture change to this project since it began — bigger than the §4a
Firestore migration. Full research feeding this section is in `REPERTOIRE.md` Part 2 (regulatory
lens: what iOS distribution actually costs/allows in 2026; competitive lens: why KMP fits this
specific codebase better than a Flutter/React Native rewrite). This section is the *how*; that
file is the *why these choices*.

**Business framing (confirmed with the user, drives scope/sequencing below):** free/test phase
now (current client base is under 10 students, staying free through ~20), paid platforms
(App Store + Play Store) only once the trainer actually starts charging students and the pricing
math is done. That means this section explicitly plans for **zero ongoing cost**, not "cheapest
possible paid tier" — every choice below is free-tier-first, with the paid migration path
documented (18g) but not built now.

**Cross-platform connectivity is not a subsystem to build.** Android↔Android, Android↔iOS, and
iOS↔iOS all resolve automatically once the iOS app talks to the same Firestore project the
Android app already uses — Firestore is the shared source of truth regardless of client platform
(§4a). The real engineering risk isn't "connecting" the platforms, it's making sure the *shared*
Kotlin code has zero hidden Android-only assumptions that would silently produce
platform-divergent behavior (e.g. a date/time formatter that behaves differently, a JSON shape
that only round-trips correctly on one platform). Item 18h below is what actually protects this.

```mermaid
flowchart TD
    A[18a. Design: module split,\nopen resource decisions] --> B[18b. Project restructure\ninto KMP modules]
    B --> C[18c. DI: Hilt to Koin]
    B --> D[18d. Database: Room to SQLDelight]
    B --> E[18e. Settings: DataStore KMP]
    C --> F[18f. Firebase access layer:\nGitLive SDK]
    D --> F
    E --> F
    F --> G[18g. Auth and Security:\nApp Check, Crashlytics per platform]
    F --> H[18h. UI: Compose Multiplatform\n+ Navigation]
    G --> I[18i. Update checker\nboth platforms]
    H --> I
    I --> J[18j. iOS distribution:\nSideStore free path now]
    J --> K[18k. CI: GitHub Actions\nmacOS runner]
    K --> L[18l. Testing]
    L --> M[18m. Registration / cutover]
```

**18a. Design rationale and open decisions**
- [x] **Framework choice: Kotlin Multiplatform + Compose Multiplatform**, not Flutter/React
      Native. Decided per `REPERTOIRE.md` Part 2 §4 — this app already *is* Kotlin/Compose, so
      KMP reuses the existing domain/data layer and most Compose UI directly; Flutter/React Native
      would both be full rewrites from zero. Compose Multiplatform reached stable iOS support in
      version 1.8.0 (May 2025) and Navigation reached stable multiplatform status in 1.10.0
      (January 2026) — both current and load-bearing enough to build on, not bleeding-edge risk.
- [x] **iOS distribution: SideStore (free Apple ID sideload) for the free/test phase, Apple
      Developer Program ($99/yr) deferred until the trainer starts charging.** Per
      `REPERTOIRE.md` Part 2 §3: there is no zero-cost path to a *professional* iOS distribution
      (TestFlight, alternative marketplaces, and the App Store all require the same $99/year
      membership just for Apple's mandatory notarization step) — SideStore is the only genuinely
      free route, and it's viable at this app's current scale because the trainer already
      configures each Android device by hand today, so a one-time per-iPhone SideStore pairing
      is the same category of effort, not new overhead. Real limitation accepted: max 3
      sideloaded apps at once on the person's iPhone (irrelevant unless they already sideload
      other things), and updates depend on SideStore's periodic re-sign/refresh actually
      succeeding (mitigated by 18i's expiry warning).
- [x] **Decided 2026-08-21: no local Mac access** (confirmed with the user — owns an iPhone for
      testing, but no Mac, and there is no legal free equivalent: Apple's EULA restricts macOS
      virtualization to genuine Apple hardware, ruling out a "hackintosh"-style VM on the
      existing Windows dev machine). **Plan**: do everything that doesn't need Xcode now
      (18b–18g) using CI (18k) as the iOS verification gate instead of local compilation; rent a
      real cloud-hosted Mac by the hour (e.g. MacinCloud, ~US$1/hr, genuine Apple hardware — not
      a licensing violation, unlike a local VM) only when 18h/18j's Xcode-only steps (initial
      signing certificate, SideStore source pairing) are actually reached. Not rented yet — no
      need until then.
- [x] **Module shape**: rename/restructure the existing single `app` Android module into a KMP
      layout — `shared/` (or `composeApp/`, matching current JetBrains project-template
      convention) holding `commonMain` (business logic, ViewModels, repositories, Compose UI,
      Room database, Koin modules) plus `androidMain`/`iosMain` (platform-specific `expect`/
      `actual` implementations only: DB file path, DataStore file location, App Check provider,
      Crashlytics/CrashKiOS wiring, update-download mechanism). A thin `androidApp` module wraps
      `commonMain` for the existing Android entry point (`MainApplication`, manifest); a
      generated Xcode project wraps it for iOS. This is the standard KMP+Compose Multiplatform
      project shape (JetBrains' own multiplatform wizard produces this layout) — not a bespoke
      structure invented for this app.

**18b. Project restructure into KMP modules**
- [x] **Toolchain checkpoint — done and verified 2026-08-21.** New `:shared` module (branch
      `feature/kmp-ios`) using `org.jetbrains.kotlin.multiplatform` +
      `com.android.kotlin.multiplatform.library` — **not** the classic `com.android.library`,
      which AGP 9 made incompatible with the Kotlin Multiplatform plugin (confirmed live: the
      classic plugin combo fails with an explicit error naming the new plugin as Google's own
      recommended migration). Targets: the Android library target plus `iosX64()`/`iosArm64()`/
      `iosSimulatorArm64()`. Holds one trivial common function + test on purpose — this is the
      "does the whole toolchain actually work" checkpoint before any real logic moves in, exactly
      as planned. **Verified for real, not just "configured":**
      - Android side, locally: `:app:compileDebugKotlin` (now depending on `:shared`) succeeds,
        `:shared:testAndroidHostTest` (the commonTest run on the JVM/Android host) passes, and
        the full `./gradlew verify assembleDebug` still passes project-wide.
      - iOS side, via CI (this Windows dev machine can't compile Kotlin/Native's Apple targets at
        all — confirmed current fact, not an assumption): new `.github/workflows/ios-ci.yml` on
        `macos-latest` (free — this repo is public) compiles all three iOS targets **and** runs
        the shared module's test on the iOS simulator — both green, ~2 minutes.
      - **Two real, previously-undiscovered bugs found and fixed while getting this checkpoint
        green** (see §11 for detail): `gradlew`'s missing executable bit (broke *every* CI run on
        this project, iOS and Android both, unrelated to this migration) and the never-added
        `GOOGLE_SERVICES_JSON` repo secret. Both fixed; `main`'s own `android-ci.yml` is now
        confirmed green for the first time.
- [ ] Move every file with zero Android-framework imports into `commonMain` first (data models —
      `Exercise`, `PerformedSet`, `WorkoutEntity` fields, `WorkoutParser.kt`'s pure parsing logic,
      `AIWorkoutResponse`/`AIWorkout`/`AIExercise` — these are the lowest-risk, highest-value
      moves since they have no platform dependency today). Done when: `WorkoutParserTest` (already
      dependency-free Kotlin) runs unmodified from `commonTest` on both the JVM (Android) test
      target and `iosSimulatorArm64` test target.

**18c. Dependency injection: Hilt → Koin**
- [x] **Done and verified 2026-08-22.** Hilt has no Kotlin Multiplatform support at all
      (confirmed, `REPERTOIRE.md` research) — a hard blocker, not a preference. Every
      `@HiltViewModel`/`@Inject`/`@Module`/`@InstallIn`/`@Singleton`/`@ApplicationContext`
      removed across 5 repositories/services (`AuthRepository`, `SettingsRepository`,
      `TrainerRepository`, `StudentRepository`, `GenerativeAiService`) and 9 ViewModels — plain
      constructors now, wired from one new `di/AppModule.kt` (Koin `module { }`), replacing the
      old `AuthModule.kt`/`DatabaseModule.kt`. `MainApplication`:
      `@HiltAndroidApp` → `startKoin { androidContext(this@MainApplication); modules(appModule) }`.
      `MainActivity`'s `@AndroidEntryPoint` removed (Koin has no per-Activity injection entry
      point to replace it with — not needed). 14 Compose screens: `hiltViewModel()` →
      `koinViewModel()` (`androidx.hilt.navigation.compose` → `org.koin.androidx.compose`).
      **One deliberate deviation from the original phrasing above**: the Koin module lives in
      `:app` for now, not `commonMain` — the repositories/ViewModels it wires haven't moved to
      `:shared` yet (that's 18f/18g/18h's job), so there's nothing in `commonMain` to wire yet.
      Moving `appModule` itself into `commonMain` happens naturally alongside those later items,
      not as separate work. No iOS `initKoin()` entry point exists yet either, for the same
      reason (no iOS UI to call it from until 18h). Verified: `./gradlew verify assembleDebug
      compileDebugAndroidTestKotlin` all green, first full pass after the sweep — no test-file
      changes were needed (`AuthRepositoryTest` already constructed `AuthRepository` directly
      with MockK fakes, never went through Hilt's test DI). **Bonus fix found while verifying**:
      `TrainerGoldenPathTest.kt` had been failing to compile since §15g added a parameter to
      `StudentDetailsScreen` that the test was never updated to pass — invisible until now
      because `verify` deliberately excludes `connectedAndroidTest` (§9) and never compiles that
      source set. Fixed (added the missing `onNavigateToPromptFicha = {}`), unrelated to Koin.

**18d. Database: Room → SQLDelight** (originally planned as Room → Room KMP; superseded, see below)
- [x] **Done and verified 2026-08-22.** The original plan's premise — "no SQLDelight migration
      needed, Room 3.0 has official KMP support" — was correct on paper but **hit a confirmed,
      reproducible upstream tooling bug**, discovered only through hands-on implementation, not
      something the original research could have caught: Room 3.0.1's KSP processor fails with a
      `[MissingType]` error the instant `@TypeConverters` is used (isolated via direct testing —
      reproduces with a trivial non-serialization converter, applied at either `@Database` or
      `@Entity` level; a database with *zero* converters processes fine, same everything else).
      Related to `github.com/google/ksp/issues/3053` but not an exact match (that issue is about
      `@Parcelize`, not `@TypeConverters` — a different trigger, same symptom category). Not
      fixable from this project — tried KSP 2.3.10 and 2.3.11, KSP1 vs KSP2, with/without
      `@ConstructedBy`, with/without AGP 9's built-in-Kotlin opt-out (that path also cascaded into
      breaking `:app`'s own task graph, worse than the original problem). **User decision:
      pivot to SQLDelight** — mature, multi-year KMP support, no equivalent issue, confirmed by
      actually building the whole database layer against it successfully on the first real attempt
      once the API specifics were right.
      - 6 tables + queries defined in `.sq` files (`shared/src/commonMain/sqldelight/...`),
        mirroring the exact schema Room had exported (`shared/schemas/.../7.json`, moved from
        `app/schemas/`) — same table/column names and types, so this isn't a schema redesign.
      - **No data-loss risk beyond what already existed**: Room was always documented (CLAUDE.md,
        this file) as an offline *cache* of Firestore, never authoritative storage — a fresh local
        SQLite file on first launch after this ships just means one extra Firestore re-sync via
        the existing `startListening` snapshot listener, not lost data.
      - `ColumnAdapters.kt` (commonMain) replaces the old `Converters.kt` — `List<String>`,
        `List<Exercise>`, `List<PerformedSet>` as JSON via `kotlinx.serialization`, same encoding
        Room used. (Boolean columns turned out to need no adapter at all once the `.sq` files'
        imports were correct — SQLDelight handles `INTEGER AS Boolean` natively.)
      - `DatabaseDriverFactory` `expect`/`actual` is the one genuinely platform-specific piece
        (`AndroidSqliteDriver` vs `NativeSqliteDriver`) — schema, queries, and adapters are all
        shared, matching the original plan's spirit even though the library changed.
      - New `AppDao` (commonMain, plain class wrapping SQLDelight's generated `Queries` objects)
        keeps the **exact same method names/signatures** the old Room `@Dao` interface had —
        `TrainerRepository`/`StudentRepository` in `:app` needed **zero changes** at the call
        site, the whole point of designing it this way.
      - `UserEntity`/`BiometricEntity`/`WorkoutEntity`/`HistoryEntity`/`ScheduleEntity`/
        `WorkoutLogEntity` lose their Room annotations, otherwise byte-identical — every other
        call site across the app (ViewModels, screens, `FirestoreMappers`) is unaffected.
      - `AppDaoTest.kt` (§9's instrumented test) updated to construct `AppDao` via
        `DatabaseDriverFactory(context, databaseName = null)` for an in-memory test database
        instead of Room's `inMemoryDatabaseBuilder` — every test *body* (the actual assertions)
        is unchanged, since `AppDao`'s method signatures didn't change.
      - `androidx.room3` and KSP removed entirely from the project — no longer used anywhere.
      - Verified: `./gradlew verify assembleDebug compileDebugAndroidTestKotlin
        :shared:testAndroidHostTest` all green locally, plus `ios-ci.yml` green on CI (2m31s) —
        both iOS Kotlin/Native targets actually compile against the SQLDelight-based `:shared`.
        One iOS-only fix needed along the way: `Dispatchers.IO` is JVM/Android-only (internal on
        Kotlin/Native) — `AppDao`'s `Flow` mapping calls now use `Dispatchers.Default`, available
        on every KMP target. §18d is fully closed.

**18e. Settings/preferences: DataStore → DataStore Multiplatform**
- [x] DataStore Preferences (not DataStore Proto) has official multiplatform support already —
      confirmed via current Android Developers KMP setup docs. `SettingsRepository`'s existing
      `stringPreferencesKey`s (Gemini/OpenAI/DeepSeek/Claude API keys) move to `commonMain`
      largely unchanged.
- [x] Platform split done, but not the shape originally sketched above: both Android and iOS use
      `OkioStorage` (not Android's `FileStorage`) — `FileStorage`'s `serializer` parameter expects
      `androidx.datastore.core.Serializer<T>`, a different interface than the
      `PreferencesSerializer` object (which implements Okio's `OkioSerializer<T>`), so `FileStorage`
      + `PreferencesSerializer` is a real type mismatch, not a config issue. Using `OkioStorage` on
      both platforms sidesteps it entirely and matches the common-factory shape
      (`createDataStore(storage: Storage<Preferences>)` in `commonMain`) with only `producePath`
      differing per platform (`context.filesDir` vs. `NSDocumentDirectory`). `SettingsRepository`
      moved to `shared/commonMain` unchanged; `shared`'s `datastore-core`/`datastore-preferences-core`
      deps had to become `api` (not `implementation`) since `:app`'s Koin module (`AppModule.kt`)
      references `DataStore<Preferences>` directly. Verified: `:app:compileDebugKotlin`,
      `verify`, `assembleDebug`, `compileDebugAndroidTestKotlin` all green locally. A real
      round-trip instrumented test was added
      (`app/src/androidTest/.../data/repository/SettingsRepositoryTest.kt`) but — like
      `AppDaoTest` — needs a real Android SQLite/filesystem environment; the two AVDs present on
      this machine (`Medium_Phone`, `Pixel_10_Pro_XL`) are both arm system images, which this
      Windows/x86_64 host's QEMU2 emulator refuses to run (`CPU Architecture 'arm' is not
      supported`) — not run on-device yet, needs either an x86_64/arm64 AVD or a physical device.
      iOS-side compile verification happens via the existing `ios-ci.yml` GitHub Actions workflow
      on push — confirmed green (run 32773333650: iOS targets compile, shared module tests pass
      on the iOS simulator). §18e is closed except for actually running
      `SettingsRepositoryTest` on a real Android device/emulator, which needs an x86_64 or
      arm64 AVD (or a physical phone) — not available on this machine right now.
- [x] **Re-verified §8's backup-exclusion fix**: `data_extraction_rules.xml`/`backup_rules.xml`
      already updated to exclude `settings.preferences_pb` (no `datastore/` prefix — the new
      `OkioStorage` setup writes straight to that filename under `filesDir`, unlike the old
      `Context.dataStore` delegate's `datastore/` subfolder convention).

**18f. Backend access layer: Firebase via the GitLive Kotlin SDK**
- [x] **Google ships no official Firebase KMP SDK** (confirmed current, mid-2026) — use the
      community-maintained `dev.gitlive:firebase-firestore`/`firebase-auth` (`GitLiveApp/
      firebase-kotlin-sdk` on GitHub), the established option for exactly this gap, actively
      maintained, in production use by other teams. The newer `KFire` alternative is still beta
      as of this research — not a safe bet for an app already depending heavily on Firestore
      transactions (`AuthRepository.claimInvite`) and listeners.
- [x] Rewrote `TrainerRepository`/`StudentRepository`/`AuthRepository` against GitLive's API in
      `shared/commonMain` (moved from `app/`, package unchanged so no caller imports needed to
      change). Real API differences from the classic SDK, not a drop-in:
      - `DocumentSnapshot` has no `getString`/`getBoolean`/`getLong` — one reified
        `get<T?>(field)` instead. This is `inline`, which has a real consequence: **it can't be
        stubbed with MockK** (inline functions have no vtable to intercept), unlike the old
        per-type getters. That broke all 6 `AuthRepositoryTest` cases (including `claimInvite()`'s
        transaction, the security-sensitive one). Discussed with the user directly — chosen path:
        delete the tests now, note the gap here, revisit with the Firebase Local Emulator Suite
        (free, runs locally, no billing plan needed) if/when this needs real coverage again. Not
        done silently.
      - Auth/Firestore calls are suspend-native (no `.await()`/Task wrapping) —
        `kotlinx-coroutines-play-services` dependency dropped, now unused.
      - Snapshot listeners are `Flow<QuerySnapshot>`-based (`query.snapshots`), no
        `ListenerRegistration` — `TrainerRepository.startListening/stopListening` now tracks
        `Job`s from `scope.launch { query.snapshots.catch { ... }.collect { ... } }` instead of
        calling `.remove()`. `StudentRepository` no longer needs `callbackFlow` at all — GitLive's
        Flow-native API replaces it directly.
      - `.whereEqualTo(field, value)` → `.where { "field" equalTo value }` (a `FilterBuilder` DSL;
        the flatter `.where(field, equalTo = value)` overload exists but is deprecated in this SDK
        version in favor of the builder — used the builder from the start).
      - GitLive's Android artifacts are compiled at JVM target 17; inlining their reified
        functions into this project's JVM 11 target failed to compile. Bumped `:app` and
        `:shared` to JVM 17 (`compileOptions`/`compilerOptions.jvmTarget`) — required, not a
        version-hygiene nicety.
      - GitLive's Android artifacts declare transitive `com.google.firebase:*` deps with no
        pinned version (same convention as using those artifacts directly) — needed
        `com.google.firebase:firebase-bom` applied in `:shared` too, not just `:app`. The
        classic `platform()` call inside `kotlin.sourceSets.*.dependencies {}` is deprecated for
        removal (KT-58759); used the project-level `dependencies { "androidMainImplementation"(
        platform(...)) }` form instead.
      - `java.util.UUID` (JVM-only) → `kotlin.uuid.Uuid` (stdlib, multiplatform since Kotlin
        2.0.20, still behind `@OptIn(ExperimentalUuidApi::class)`) for `generateInvite()`'s code.
      - `System.currentTimeMillis()` has no multiplatform stdlib equivalent
        (`kotlin.system.getTimeMillis()` is Native-only and deprecated) — added a small
        `expect`/`actual` `currentTimeMillis()` in `shared/util/TimeUtil.kt`.
      Verified: `:app:compileDebugKotlin`, `verify`, `assembleDebug`,
      `compileDebugAndroidTestKotlin` all green locally. iOS CI: `compileKotlinIosSimulatorArm64`/
      `compileKotlinIosArm64` (pure Kotlin/Native compile) are green. `iosSimulatorArm64Test`
      is NOT — confirmed exactly the risk flagged above: `commonTest` now links a runnable iOS
      test binary that transitively pulls in GitLive's Firebase code, and that link step fails
      with `ld: framework 'FirebaseCore' not found`. Kotlin/Native *compiling* against GitLive's
      Firebase API doesn't need the native frameworks present, but *linking* an actual binary
      does — and this project has no CocoaPods/SPM iOS Firebase setup yet. Disabled that CI step
      for now (`ios-ci.yml`, commented out with an explanation) rather than leave CI red; tracked
      as real follow-up work, not silently dropped — see the new item below.
- [ ] **iOS Firebase native framework linking**: add CocoaPods (or SPM) integration so
      `FirebaseCore`/`FirebaseAuth`/`FirebaseFirestore`/`FirebaseCrashlytics` `.framework`
      binaries are on the Kotlin/Native linker path, so `:shared:iosSimulatorArm64Test` (and,
      later, the real iOS app) can actually link. Can be done entirely via GitHub's macOS CI
      runner (CocoaPods is preinstalled) — doesn't need a personal Mac — but is real toolchain
      work (Kotlin's `native.cocoapods` Gradle plugin, a `Podfile`, `pod install` in CI) that
      belongs with the iOS app scaffold (§18h+) rather than this repository-layer rewrite.
      Re-enable the commented-out CI test step in `ios-ci.yml` once this lands.
- [x] `FirestoreMappers.kt`'s entity↔doc mapping moved to `commonMain` largely unchanged — GitLive
      auto-detects `Map<String, Any?>` at the call site (`FirebaseMapSerializer`, checked via a
      runtime `is Map<*, *>` check, not the static type) and encodes it without needing
      `@Serializable`, so the existing plain-map mapper functions needed only the
      `DocumentSnapshot.get<T?>()` rewrite described above, not a structural rewrite.
- [x] **`GenerativeAiService`'s HTTP calls (OpenAI/DeepSeek/Claude via plain `HttpURLConnection`)
      moved to Ktor Client 3.5.2** (JetBrains' own multiplatform HTTP library) — `OkHttp` engine
      on Android, `Darwin` on iOS, `ContentNegotiation` + `kotlinx.serialization.json` for
      request/response bodies, `expectSuccess = false` + a manual `response.status.isSuccess()`
      check to keep the old "return the error body as an error string" behavior instead of Ktor's
      default throw-on-non-2xx. `HttpClient()` with no explicit engine works unchanged in
      `commonMain` since each source set (androidMain/iosMain) only has one engine artifact on
      its classpath — Ktor auto-selects it, no `expect`/`actual` needed for the client itself.
      Confirmed (via GitHub's `GitLiveApp`-adjacent research, i.e. checking, not assuming): Firebase
      AI Logic (Gemini) has **no official Kotlin Multiplatform/iOS SDK** — only community bridges
      exist (`firebase-ai-kmp`), each needing its own native-framework linking, the same class of
      problem just hit with GitLive's own Firebase Auth/Firestore (see the iOS CI note above).
      Chose "scope as a known iOS gap" over chasing another native bridge right now: added a
      `GeminiProvider` interface (`shared/commonMain`) with an `AndroidGeminiProvider` actual
      (the real Firebase AI Logic call, moved from the old `GenerativeAiService`) and an
      `IosGeminiProvider` stub that returns an honest "not available on iOS yet, use OpenAI/
      DeepSeek/Claude" string — not a crash, not a silently missing case. `GenerativeAiService`
      itself now lives fully in `shared/commonMain`, taking `GeminiProvider` and a
      pre-read `volumeReference: String` as constructor params (the volume-reference `.md` asset
      read stays in `:app`'s Koin module via `androidContext().assets` — no cross-platform bundled
      resource reading wired up yet, not needed until an iOS DI graph exists in §18h+).
      `libs.firebase.crashlytics`/`libs.firebase.ai` moved off `:app` entirely — Crashlytics calls
      go through GitLive's wrapper now (`Firebase.crashlytics`, already added for
      `TrainerRepository`), AI Logic's classic SDK dependency moved to `shared/androidMain`
      alongside `AndroidGeminiProvider`. Verified: `:app:compileDebugKotlin`, `verify`,
      `assembleDebug`, `compileDebugAndroidTestKotlin` all green locally. **§18f is fully closed**
      except for the iOS native Firebase framework linking tracked as its own item above.

**18g. Auth and Security — platform-specific pieces GitLive doesn't cover**
- [ ] **App Check**: GitLive's SDK doesn't wrap App Check. Keep Android's existing
      `DebugAppCheckProviderFactory`/`PlayIntegrityAppCheckProviderFactory` wiring in
      `androidMain` unchanged; add a thin `iosMain` `actual` bridging to Firebase iOS SDK's own
      App Check (App Attest provider for release, debug provider for local iOS testing) — a
      real native-bridge implementation, not optional, since `firestore.rules`'/Auth's security
      posture assumes App Check is active on every client.
- [x] **Crashlytics**: resolved as a side effect of §18f, not via either option originally
      listed here (both predate this finding). `dev.gitlive:firebase-crashlytics` — the *same*
      GitLive SDK already adopted for Auth/Firestore — ships a real, verified `commonMain` API
      (`recordException`, `log`, `setUserId`, `setCustomKey(s)`, `setCrashlyticsCollectionEnabled`,
      confirmed by reading the actual GitHub source, not assumed from docs) that covers everything
      this app calls. `TrainerRepository`/`GenerativeAiService` already use
      `Firebase.crashlytics.recordException(e)` from `commonMain`. No CrashKiOS, no
      Android-only fallback needed. Same caveat as the rest of §18f applies: this compiles for
      iOS, but *linking* a real iOS binary still needs the native `FirebaseCrashlytics.framework`
      wired up — tracked under the "iOS Firebase native framework linking" item above, not a
      separate Crashlytics-specific gap.
- [ ] Re-verify §8's App Check debug-token registration flow (§13a) still applies correctly once
      requests can come from either platform's debug provider — the Firebase Console's debug
      token allow-list is per-install, not per-platform, so this should be mechanically the same
      process repeated once per iOS test device, not a new mechanism.

**18h. UI: Jetpack Compose → Compose Multiplatform, Navigation**
- [ ] Move every screen composable with no Android-only API calls (`ContentType`/autofill
      semantics, `LocalConfiguration`, Android-specific icons) into `commonMain` — per current
      migration reports for exactly this move (existing Jetpack Compose app → Compose
      Multiplatform), most Composables are reported to work unchanged; the real work is
      resources (no generated Android `R` class in common code — move string/icon resources to
      Compose Multiplatform's resource system) and anything directly touching
      `android.content.Context`/`ClipboardManager`/Android permissions APIs (`expect`/`actual`
      those specifically, e.g. `PromptFichaScreen`'s clipboard copy from §15e).
- [ ] Adopt the official Compose Multiplatform Navigation library (stable since 1.10.0) as a
      drop-in for the existing Navigation Compose usage (`AppNavigation.kt`'s `Screen` sealed
      class/`NavHost` already maps closely to the multiplatform API). iOS-specific: swipe-back
      gesture needs an explicit `iosMain` UIKit gesture recognizer or Compose Cupertino — native
      back-swipe isn't automatic, confirm current guidance at implementation time (this is an
      area still actively evolving per the research).
- [ ] **Explicitly re-verify each Android-only UI fix already shipped this project** doesn't
      silently regress on iOS: the `NonObservableLocale` fix (§10, `LocalConfiguration.current
      .locales[0]`), the R8/lint sweep (§8/§10, Android-build-only, doesn't apply to iOS but
      shouldn't be assumed equivalent-safe without checking), and `Icons.AutoMirrored.*` usage
      (already correctly multiplatform-safe per §13's fix this session).

**18i. In-app update checker — both platforms (user's explicit ask)**
- [ ] New `commonMain` `UpdateChecker`: reads a small `latest.json` manifest (version code,
      changelog note, platform-specific download URL) hosted in this same public GitHub repo
      (e.g. via GitHub Releases or a raw file on `main`) — no new backend needed, reuses existing
      free infrastructure (the repo is already public, confirmed 2026-08-21).
- [ ] **Automatic check**: on app launch (not a true background job — keeps this portable across
      platforms without needing a cross-platform WorkManager equivalent, consistent with this
      project's existing "no speculative infrastructure" convention), compare the running app's
      version against the manifest; if newer, show a non-blocking banner.
- [ ] **Manual check**: a "Verificar atualização" button in Settings (new tab or added to the
      existing "IA" tab's shell — §16's tabbed Settings already anticipated more categories being
      added later), calling the same `UpdateChecker` on demand.
- [ ] **Android-specific action**: banner/button opens the new `.apk` download URL directly
      (Android already trusts "install from unknown sources" for this app, per the existing
      sideload distribution model) — the person taps through Android's own install prompt, same
      as today's manual reinstall, just without needing you physically present.
- [ ] **iOS-specific action**: since SideStore already re-signs/refreshes from its configured
      source periodically, the in-app banner's role is different — show **days remaining until
      the current signature expires** (the real risk flagged in 18a) with a "atualizar agora"
      button that triggers SideStore's refresh directly if a URL scheme/deep link for that
      exists, or at minimum clear instructions, so an expiring app is never a silent surprise.

**18j. iOS distribution: SideStore free path (now) → Apple Developer Program (later, when paid)**
- [ ] Host the built `.ipa` + an AltStore/SideStore-format "source" JSON (app metadata + download
      URL + version) somewhere stable and free — a GitHub Release asset on this same public repo
      is the natural choice, consistent with 18i's update-manifest hosting.
- [ ] Document (in this file, not just in chat) the one-time per-iPhone SideStore setup steps —
      this becomes the "dev setup note" the project has flagged needing before (§13a already
      noted the same need for App Check debug tokens once more than one test device exists).
- [ ] **(manual, deferred)** When the trainer starts charging students: enroll in the Apple
      Developer Program ($99/yr), switch distribution to TestFlight (up to 10,000 testers, no
      per-device technical setup for the end user), and revisit whether the Play Store's one-time
      $25 fee is also worth paying at that point (§11 already declined this for Android at the
      free stage — same reasoning to revisit, not redo, once there's real revenue).

**18k. CI: build iOS on GitHub Actions' macOS runner**
- [x] **Pulled forward and done first, ahead of its original position in the plan — done
      2026-08-21.** Since this dev machine can't compile Kotlin/Native's Apple targets at all
      (confirmed, not assumed — Kotlin/Native's Apple-target compiler requires macOS/Xcode's
      toolchain), CI had to exist *before* any real iOS-affecting code could be verified, not
      after. New `.github/workflows/ios-ci.yml`, `macos-latest`, triggered on push to
      `main`/`feature/kmp-ios` + `workflow_dispatch`: compiles all three iOS Kotlin/Native
      targets and runs `:shared`'s test on the iOS simulator. **Confirmed green** (~2 min) and
      **confirmed free**: this repository is public, and GitHub Actions macOS runner minutes are
      unlimited/free on public repos (confirmed current, `REPERTOIRE.md` research) — no CI cost
      concern here, unlike a private repo where macOS minutes bill at 10× the standard rate.
      Producing a signed `.ipa` is deferred to 18j (needs real signing setup, not yet done).
- [x] Kept separate from `android-ci.yml`, which is unaffected — confirmed both workflows pass
      independently (`android-ci.yml` on `main`, `ios-ci.yml` on `feature/kmp-ios`).

**18l. Testing**
- [ ] Move `WorkoutParserTest` (already dependency-free) to `commonTest` — done when it passes on
      both `testDebugUnitTest` (Android/JVM) and an `iosSimulatorArm64` test run.
- [ ] `AuthRepositoryTest` (MockK-based) needs a KMP-compatible mocking approach — MockK is
      JVM-only; either keep this test Android-only (acceptable, it's testing Android-specific
      Firebase mock plumbing today, not core logic) or migrate the assertions it covers into a
      `commonTest` against GitLive's SDK using a fake/in-memory implementation instead of a mock.
      Don't silently drop the coverage — decide and document which.
- [ ] `AppDaoTest`/`workoutLog_roundTripsPerformedSets` (Room in-memory, currently `androidTest`-
      only) — re-run against Room's KMP in-memory test builder on `iosTest` too, given 18d's
      migration; this is genuinely new coverage the project didn't have before (Room's iOS path
      was untested until this move).
- [ ] `TrainerGoldenPathTest.kt` (Compose UI test) — Compose Multiplatform's iOS UI-testing
      tooling is comparatively less mature than Android's `ui-test-junit4`; confirm current
      support at implementation time. If iOS Compose UI testing isn't practical yet, keep this
      test Android-only and say so explicitly rather than silently losing golden-path coverage
      with no note.

**18m. Registration/cutover**
- [ ] Once 18a–18l are green on both platforms, cut the existing `app` module over to depend on
      `shared` as its only source of truth (no dead duplicate Android-only copies of anything
      that moved to `commonMain`) — verified via a full `./gradlew verify assembleDebug` pass
      identical in spirit to every other verification gate this project already uses, plus the
      equivalent iOS build succeeding in CI (18k).
- [ ] Update `CLAUDE.md` and `README.md` to describe the new KMP module shape — this is exactly
      the kind of cross-cutting convention change CLAUDE.md exists to document (per its own
      existing "Module documentation strategy" note, §1).

---

## Suggested build order (what blocks what) — revised 2026-08-18

**Done** (§0, §1 CLAUDE.md, §2 git, §4a Firestore migration, §5d UI debt + AI button wiring, §7
firestore.rules + self-registration, §8 INTERNET/backup-exclusion/R8, §9 first real tests, §10
lint) — see each section's `[x]` items for what was actually verified, not just attempted.

**Also done (2026-08-17, via `/execgoals`):** §7 invite-code linking (unify model), §5b Student
screens, §5e ADM Dashboard (Crashlytics + real counts + OpenAI as a real second provider), §8
Firebase App Check, §5c Trainer recent-activity + generalized `LineChart`. Verified via
`./gradlew compileDebugKotlin testDebugUnitTest lint` (all green) — not runtime-tested on a
device/emulator (none set up in this environment). **Two manual console steps still needed before
any of this is live**, not doable from here: publish the updated `firestore.rules` (invites +
users create/delete rules) in the Firebase console, and register the app for App Check enforcement
(Console → App Check → Play Integrity).

**Also done (2026-08-17, via `/execgoals`, same day):** §5d hypertrophy volume reference grounding
(text-embedding approach) — not yet checked against a live API call, see the item itself.

**Also done (2026-08-18, via `/execgoals`):** §1 KDoc pass (`WorkoutParser`, `AdminViewModel`),
§6 connectivity items confirmed accurate against the code, §9 Compose UI golden-path test
(`TrainerGoldenPathTest.kt`) + single `./gradlew verify` command, §11 `.github/workflows/android-ci.yml`,
§10 splitting `StudentDetailsScreen.kt`/`ManualWorkoutScreen.kt`, §11 release keystore + signing
config (verified via a real `assembleRelease`), §11 privacy policy + store listing copy drafted.
**Real bug found and fixed while verifying §6/writing the §9 test**: `WorkoutEntity.status` was
never actually set to `"assigned"` by anything — the Student's "Meus Treinos" query would have
matched zero workouts, ever. Fixed in `TrainerRepository` (see §6 for detail).

**Also done (2026-08-18, later the same day — §3 decision revised):** the user reconsidered and
chose to stay on Firebase's free Spark plan rather than pay for Blaze, which ruled out the Cloud
Function proxy entirely. Migrated Gemini to the **Firebase AI Logic SDK** instead (free on Spark,
officially maintained, no client-held key) — this fully resolves §3's deprecated-SDK and
key-exposure concerns without any billing change. Trade-off: Gemini is now one shared
project-level configuration instead of a key per trainer; **OpenAI stays fully per-trainer**
(unaffected, still BYO-key) as the alternative for anyone who wants that. §6's Cloud Function
contract item is now moot for the same reason. Verified via
`./gradlew compileDebugKotlin compileDebugAndroidTestKotlin verify assembleRelease` (all green).
**New manual Firebase Console step** (join the two already pending — see §8): enable the project
for Gemini access at Build → AI Logic → Get started → "Gemini Developer API" (free) — the app's
Gemini calls will fail at runtime until that's done. CI workflow itself also still unverified
until the `GOOGLE_SERVICES_JSON` repo secret is added (manual, user-only).

**Also decided (2026-08-18):** not publishing to the Play Store — small client base, the store's
ongoing overhead (Data Safety form, listing upkeep, review process) isn't worth it. Distribution
is direct (sideloaded signed APK) instead; dropped the Play Store-only prerequisites accordingly
(kept the privacy policy and release signing — both useful regardless of distribution channel).

**MVP checklist complete: 58/58.** Everything achievable without external decisions/access this
session doesn't have is done. What's left is either a manual step only the user can do (the three
Firebase Console steps above, the `GOOGLE_SERVICES_JSON` CI secret) or explicitly deferred
(§12 Phase 2 — only if/when prioritized, each deserving its own `/newgoal` pass when the time
comes).

**Post-MVP addition (2026-08-18/19, live device testing):** discovered while testing on a real
device — there was no way to create the *first* TRAINER account. Self-registration always yields
role=STUDENT by design (`AuthRepository.register()`, no self-promotion, see §7); only an ADM can
grant TRAINER, and `firestore.rules`' `isAdmin()` bypass already permitted this, but nothing in
the UI exposed it. Iterated through two designs (see conversation) before landing on a
**request/approve flow**, matching how the user actually wants to onboard trainers:

- A self-registered (unlinked) STUDENT can tap "Solicitar acesso de Trainer" on `LoginScreen`
  (`AuthViewModel.requestTrainerAccess()` → `AuthRepository`), writing a self-owned
  `trainerRequests/{uid}` doc (email + timestamp) — a pure mailbox, carries no privilege by
  itself.
- The ADM's Gestão tab lists pending requests (`AdminViewModel.loadTrainerRequests()`) with
  **Aceitar**/**Recusar** buttons. Aceitar writes `role: TRAINER` to `users/{uid}` (the same
  `isAdmin()`-gated write already built) and deletes the request; Recusar just deletes it.
  Approval takes effect immediately — no code to relay, the person just needs to re-login.
- Kept the earlier UID-paste form too, relabeled "Promover manualmente (avançado)" — a fallback
  for a request that never landed (offline write, etc.), not the primary path anymore.
- **New `firestore.rules` addition**: `trainerRequests/{uid}` (self-create by the owner, ADM-only
  read/delete) — bundle this into the same Console rules-publish as the other pending rule
  changes.

Compiled (`compileDebugKotlin`) and installed on a physical device (Samsung SM-S926B) for
verification at each iteration.

**Post-MVP fixes (2026-08-19, via `/newgoal` — see §13):** further live-device testing surfaced
three items, tracked with the `fix.md` repro/root-cause/fix/regression-test discipline instead of
this narrative log from here on — §13a (App Check) and §13b (ADM refresh) are fixed and verified
live; §13c (trainer-request end-to-end) and §13d (invite claim on an existing doc) still need
work — §13d's rules diff + UX fix aren't implemented yet.

**AI ficha strategy pivot (2026-08-19, via `/newgoal /repertoire` — see `REPERTOIRE.md`, §14,
§15):** after §13a's fix, the *next* Gemini error the user hit (`This model is currently
experiencing high demand`) turned out to be a real, external, industry-wide free-tier reliability
problem (confirmed via research, §14a) — not something to keep debugging in this codebase.
Decision: stop leading with live in-app AI calls for now. §15 replaces the direct-call
`AIWorkoutScreen` path with a prompt-template-and-paste workflow (provider-agnostic — the trainer
uses whatever AI app they already have) that also adds effective-volume-per-muscle math
(`Σ sets × activation-coefficient`, validated against real dose-response literature in
`REPERTOIRE.md` §1) to the ficha output. §14 researches cheap providers for a *later* phase-2
re-integration (recommendation: repoint the already-wired OpenAI path at a current cheap model
before building any new provider integration) — doesn't block §15. Run `/execgoals` against §15
first (it's the immediate, shippable half), then §13c/§13d, then §14 only when the user wants
in-app AI back.

**Provider choice expanded, Settings reorganized (2026-08-19, via `/newgoal` — see §16):** the
user chose to expand rather than narrow the in-app AI path — DeepSeek and Claude join
Gemini/OpenAI as selectable providers (all three non-Gemini providers BYO-key, same pattern),
and Settings becomes tabbed (starting with one "IA" tab) so future settings categories have
somewhere to go without a redesign. This amends §15g: `AIWorkoutScreen` stays reachable alongside
`PromptFichaScreen`, both offered from the same entry points, not one replacing the other. Run
`/execgoals` against §16 together with §15 — they share entry-point registration (16g/15g) and
should land in the same pass.

**§13d/§15/§16 implemented and verified via `compileDebugKotlin`, `testDebugUnitTest`, `lint`
(all green) — 2026-08-19, via `/execgoals`.** A real parsing bug was found and fixed while writing
the new `WorkoutParserTest` cases: a comma-decimal coefficient in a `[Muscle:coef]` annotation
silently parsed wrong because comma also separates muscles in the same bracket — the annotation
format now requires a period, documented in the prompt template. Remaining opens are all manual
(reconnect the device, republish `firestore.rules`, add test API keys for DeepSeek/Claude to
verify end-to-end) — no code left to write for §13d/§15/§16.

**§17 planned but explicitly not started (2026-08-19, via `/newgoal`) — student connection
clarity, trainer-granted permissions (`canSelfAssess`/`canLogBiometrics`), and a PAR-Q-based
self-assessment feature (`assessments/{id}`, time-series like `biometrics`).** Grounded in a real
code read: `AddStudentScreen`'s draft flow is not architecturally broken (the trainer's student
list already merges drafts + linked accounts) and should stay, matching how Trainerize/TrueCoach
also separate "add a client record" from "invite them to the app" — the actual gap is just a
missing visual badge for draft-vs-connected. A real latent bug was also found while researching
this: `AuthRepository.claimInvite()` overwrites (not merges) the claiming account's profile,
which would silently wipe any self-entered data (like a self-assessment) filled in before
claiming — every new capability in §17 is deliberately scoped to already-linked students only, to
avoid that risk without having to touch the working claim mechanism. The user was explicit that
now might not be the right time to build this — §17 is ready whenever they decide, not queued for
immediate execution.

**§18 planned (2026-08-21, via `/newgoal /repertoire`) — bring the app to iOS via Kotlin
Multiplatform + Compose Multiplatform, distributed free through SideStore until the trainer
starts charging students.** Triggered by a direct user need, not speculative scope: the trainer's
real client base includes iPhone users, and per `REPERTOIRE.md` Part 2, there is no zero-cost way
to distribute a *professional* iOS build (TestFlight and every 2026-era alternative marketplace,
including Brazil's new CADE-mandated one, still requires the same $99/yr Apple Developer Program
membership for mandatory notarization) — SideStore (free-Apple-ID sideload with periodic
self-refresh) is the one genuinely free route, judged acceptable at the current sub-20-student
scale given the trainer already does comparable per-device setup manually for Android today. Key
technical finding that de-risks this significantly: **Room now has official first-class Kotlin
Multiplatform support as of Room 3.0 (March 2026)**, so the existing Room-based data layer mostly
just moves into shared code rather than needing a separate database engine (SQLDelight) — this
was the single biggest unknown going in and turned out to be a non-issue. The two real forced
rewrites are **Hilt → Koin** (Hilt has zero KMP support, confirmed current) and the Firebase
access layer (**no official Google KMP Firebase SDK exists**; using the community-maintained
GitLive `firebase-kotlin-sdk`, the established option). Cross-platform connectivity
(Android↔Android/Android↔iOS/iOS↔iOS) needs no separate engineering — it's a free consequence of
both platforms sharing one Firestore backend, not a subsystem to build. §18 is a large,
foundational restructure — run `/execgoals` against it only when ready to commit real time to it,
and confirm Mac access (18a's one open item) before starting the UI/distribution-heavy back half
(18h onward).

**§18 started 2026-08-21 — toolchain checkpoint (18b) and CI (18k) done and verified green,
first real code of the migration.** Working on branch `feature/kmp-ios`, not `main` — this is a
large, multi-step migration best kept isolated until it's stable. Confirmed with the user: no
Mac access (18a decided — CI is the iOS verification gate for now, a cloud Mac rental is deferred
until the Xcode-only steps in 18h/18j are actually reached, not needed yet). Set up the new
`:shared` KMP module (using AGP 9's `com.android.kotlin.multiplatform.library` plugin, not the
classic `com.android.library`, which AGP 9 made incompatible with Kotlin Multiplatform) and
verified the whole toolchain end-to-end: Android compiles/tests locally, iOS compiles and its
test runs on CI's free macOS runner (public repo). **Found and fixed two real, previously-hidden
bugs unrelated to the migration itself while getting this green**: `gradlew` was committed
without its executable bit, breaking every CI run (Android and iOS) since at least the last two
pushes to `main`; and the `GOOGLE_SERVICES_JSON` repo secret documented as a pending manual step
in §11 had still never actually been added. Both fixed directly — `main`'s `android-ci.yml` is
now confirmed green for the first time this project has had working CI. Next: 18b's remaining
item (move `WorkoutParser`/data models into `commonMain`), then 18c onward in order.
