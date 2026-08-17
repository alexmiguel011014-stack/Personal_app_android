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
- [ ] **Module documentation strategy (decided 2026-08-17, not yet applied everywhere):** don't add
      a separate `docs/` tree that will drift from the code — keep `CLAUDE.md` for cross-cutting
      conventions (routing, data-layer shape, parsing quirks) and add a short KDoc block
      (`/** ... */`) directly on classes whose *purpose* isn't obvious from their name/members
      alone. Already done this session: `TrainerRepository` (Firestore-as-source-of-truth
      explanation) and `FirestoreMappers.kt` (why plain maps, not POJO reflection). Still missing
      real KDoc: `WorkoutParser` (the sets-vs-reps heuristic lives only in a code comment today,
      should be a proper doc comment), `AppLogger`/`AdminViewModel` once §5e is built (new code,
      document from the start rather than retrofitting).

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
- [ ] **No Cloud Functions / server layer exists.** Gemini is called directly from the Android
      client today (`GenerativeAiService`) using a per-user API key typed into Settings. Per
      current (Aug 2026) guidance this is actively discouraged: enabling the Gemini API on a
      Google Cloud project silently grants every key on that project Gemini access, and Google
      is retiring unrestricted/standard API keys for the Gemini API (June 19, 2026 for
      unrestricted keys, September 2026 for all standard keys) in favor of properly scoped auth.
      Plan: add a thin Firebase Cloud Function (callable, auth-gated) that holds a
      server-side-restricted Gemini key and proxies `generateWorkout` requests; stop sending
      raw Gemini API keys from the client. If keeping the "trainer brings their own key" product
      idea, at minimum stop calling Gemini directly from the client with it — proxy through the
      function instead. (Sources: CloudSEK/Quokka/DoiT reporting on the Feb 2026 Gemini key
      exposure and the standard-key retirement timeline.)
- [ ] Update the Gemini model id: `GenerativeAiService.kt` hardcodes `gemini-1.5-pro`, an older
      model. Move to a current Gemini 2.x/3.x model id (e.g. a `gemini-2.x-flash`/`-pro` tier)
      once the backend proxy exists, matching whatever `google.ai.client.generativeai` /
      Firebase AI Logic SDK version is current at implementation time.
- [ ] **`com.google.ai.client.generativeai` (the SDK `GenerativeAiService.kt` uses today) is
      officially deprecated** — its own README: "No further changes or additions are planned for
      this deprecated SDK," superseded by the Firebase AI Logic SDK (`Firebase.ai(backend =
      GenerativeBackend.googleAI()).generativeModel(...)`, package `com.google.firebase:firebase-ai`).
      Independent reason to migrate on top of the raw-client-key concern above — bundle the SDK
      swap into the same pass as the Cloud Function proxy work. See §5d for why this specifically
      matters now (the PDF-grounded ficha generation follow-up depends on this SDK swap).

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
- [~] **ADM role** — `AdminDashboardScreen` exists and is routed from `RoleRouter`, but **every
      tab is a non-functional mockup** — confirmed 2026-08-17 from a real device screenshot after
      first ADM login. See §5e for the concrete plan to make each tab real.
- [x] Evolution/biometrics chart exists: `Components.kt` has a custom `WeightChart` (Compose
      `Canvas`, hand-drawn line + points), used from `StudentDetailsScreen`. No charting library
      dependency — keep it that way; extend this same component for exercise-load progression
      (5c) instead of adding a charting library.

**5b. Student role — not built (Product goal #2)**
- [ ] `RoleRouter` now shows a real explanatory message instead of a silent dead-end for
      `Authenticated(STUDENT)` (fixed 2026-08-16, see §5d's `LoginScreen` fix), but no actual
      student-facing screens exist yet. **No longer blocked on §4a** — that migration is done.
      Now blocked only on §7's invite-code linking (a student needs a `trainerId` before "my
      workouts" means anything) and the data-model decision in §7. Build, once those land:
      - **My Workouts** — read-only list of ficha(s) the Trainer assigned (`workouts` where
        `studentId == me && status == assigned`), drill into exercises/sets/reps/weight targets.
      - **Log Session** — for an assigned workout, let the Student enter what they actually did
        per exercise (sets × weight × reps) and submit — writes a `workoutLogs` doc (§4a). This
        is the "atualização de carga" from Product goal #3, and is the one genuinely new screen
        this whole feature set hinges on.
      - **My Evolution** — read-only version of the Trainer's evolution report (5c) scoped to
        themselves: biometrics chart (reuse `WeightChart`) + per-exercise load-progression chart.

**5c. Trainer — receiving updates + evolution report (Product goal #3, #4)**
- [ ] Trainer needs visibility into new `workoutLogs` as they come in — simplest version: a
      "Recent activity" section on `StudentDetailsScreen` listing the student's latest logged
      sessions (date, exercise, weight/reps), sourced from a Firestore snapshot listener once
      §4a lands (real-time, no push notifications required for v1 — don't add FCM unless
      explicitly requested later, it's out of scope for this goal).
- [ ] Generalize `WeightChart` into a `LineChart(points, label, unit)` reusable component, and
      let the Trainer pick which exercise to chart from that student's `workoutLogs`.

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

- [ ] **AI ficha generation — future: ground it in a reference PDF (explicitly deferred by the
      user, documented now so `/execgoals` doesn't have to re-research it later).** Today
      `GenerativeAiService.generateWorkout()` sends only a text prompt built from the student's
      profile fields (§3). The user wants to later attach a PDF with partial training-volume
      guidelines (sets/reps/frequency references) so the AI grounds its output in that reference
      instead of general knowledge — "just getting AI integration working [the button, above] is
      already a win" for now; this is the next increment after that.
      - Researched (2026-08-16): Gemini's Kotlin SDKs support PDFs natively as multimodal input —
        `content { inlineData(bytes = pdfBytes, mimeType = "application/pdf"); text(prompt) }`,
        no separate text-extraction/OCR step needed. Docs source:
        firebase.google.com/docs/ai-logic/analyze-documents. Limits: 50MB/file, 1000 pages/file,
        each PDF page is billed/counted like an image.
      - **Important, found during this same research pass:** the SDK this project currently uses
        (`com.google.ai.client.generativeai`, `google.generativeai` in `libs.versions.toml`) is
        **officially deprecated** — its own README states "No further changes or additions are
        planned for this deprecated SDK," superseded by the Firebase AI Logic SDK
        (`com.google.firebase:firebase-ai`, called via `Firebase.ai(backend =
        GenerativeBackend.googleAI()).generativeModel(...)`). This is a second, independent reason
        to migrate (on top of §3's client-side-API-key security concern) — do the SDK swap
        *before or alongside* adding PDF grounding, not after, so the new feature isn't built on
        the SDK that's about to be replaced.
      - Planned shape once the user is ready to build this:
        1. Migrate `GenerativeAiService` from `com.google.ai.client.generativeai` to the Firebase
           AI Logic SDK (`Firebase.ai(...).generativeModel(...)`) — same `content { }` builder
           DSL, low-risk swap; also resolves the outdated `gemini-1.5-pro` model id noted in §3.
        2. Add a Settings entry (or a one-time asset bundled with the app) for the reference PDF;
           read its bytes and pass via `inlineData(...)` alongside the existing text prompt in
           `generateWorkout()`.
        3. No change needed to `AIWorkoutViewModel`'s JSON-parsing contract — the PDF only changes
           what grounds the model's answer, not the requested output shape.
      - Still inherits §3's "don't call Gemini directly from the client with a raw key" concern
        (unchanged by adding PDF input) — if/when the Cloud Function proxy from §3 gets built, the
        PDF bytes get sent to the function instead of embedded client-side, same as the text
        prompt today.

**5e. ADM Dashboard — currently 100% mocked (found 2026-08-17, from a real-device screenshot
after the first successful ADM login).** All three tabs render fixed data that never changes and
don't reflect anything real. Each needs its own fix:

- [ ] **Logs tab** — the log text is a hardcoded string literal in `LogsTab()`
      (`"[18:30:22] ERROR: Gemini API Key invalid\n..."`, always the same two lines), and
      "Copiar"/"Limpar" are empty `onClick` placeholders (same "looks unfinished" bug pattern as
      §5d). There is also **no error logging happening anywhere in the app today** — catch blocks
      in `GenerativeAiService`, `AuthRepository`, and the `TrainerRepository` snapshot listeners
      (`addSnapshotListener { snapshot, error -> ... }` — `error` is currently received and
      silently ignored) just swallow or surface a one-off error to the immediate caller, nothing
      persists. Two possible shapes, pick one before building:
      - **Quick (device-local only):** new Room entity `AppLogEntity(id, timestamp, level,
        message)` + a small injected `AppLogger` singleton that the existing catch blocks call
        into; `LogsTab` reads it via `Flow`; "Copiar" copies the rendered text
        (`ClipboardManager`/`LocalClipboard`); "Limpar" deletes all rows. Cheap to build, but only
        shows errors that happened *on the ADM's own device* — not useful for monitoring other
        trainers' sessions, which is presumably the actual point of an ADM log viewer.
      - **Proper (fleet-wide):** wire Firebase Crashlytics (already Firebase-adjacent, purpose
        built, free tier, no custom log-shipping code) instead of hand-rolling a Firestore log
        collection — a hand-rolled `appLogs` Firestore collection would add real per-write cost at
        scale for something Crashlytics already solves. Recommended over the quick option if the
        ADM dashboard is meant to actually monitor the app in the field, not just the ADM's device.
      - Either way, this needs a decision from the user on which shape before implementation —
        don't build the quick version and call it done if fleet-wide monitoring is the actual goal.
- [ ] **Gestão tab** — "Personais: 12" and "Total Usuários: 154" are hardcoded string literals in
      `ApiStatusTab`'s caller (`StatCard("Personais", "12", ...)` / `StatCard("Total Usuários",
      "154", ...)`), and "Personais Ativos" has no implementation at all (just a header, the body
      is a `// Lista de personais aqui...` comment). Real implementation:
      - Researched (2026-08-17): Firestore's count aggregation query —
        `firestore.collection("users").whereEqualTo("role", "TRAINER").count().get(AggregateSource.SERVER).await()`,
        read via `.count` on the result (`firebase.google.com/docs/firestore/query-data/aggregation-queries`).
        No new index needed (single-field equality). Confirms `firestore.rules`' `isAdmin()`
        already permits this: it only depends on the *caller's* own role, not each matched
        document's fields, so Firestore can grant the query/count without evaluating it
        per-document — no rules change needed.
      - "Personais" card → `users` where `role == "TRAINER"`, count. "Total Usuários" card → count
        of all `users` docs (no filter).
      - "Personais Ativos" list → the same `where("role","==","TRAINER")` query, not aggregated —
        actual `get()`, render name (+ maybe student count per trainer, later).
      - New `AdminViewModel` (doesn't exist yet) to hold these three as `StateFlow`s, injected with
        `FirebaseFirestore` directly (this is ADM-only cross-trainer data, doesn't belong in the
        per-trainer-scoped `TrainerRepository`).
- [ ] **APIs tab** — all three rows are hardcoded `ApiStatusRow(name, "Online", SuccessGreen)` —
      always green, never actually checked. Also: **`OpenAI ChatGPT` isn't used anywhere in the
      app** — `SettingsRepository.openaiApiKey` stores a key but no code ever calls OpenAI's API
      with it; showing it as "Online" is doubly fake (nothing to be online). Decide: remove the
      dead OpenAI key field from Settings/this tab (dead-code cleanup, no functionality lost since
      none exists), or actually wire OpenAI as a real second provider (larger, undecided scope —
      GOALS.md's Product goal never asked for multi-provider AI). Recommend removing it unless the
      user actually wants a second AI provider. For the two real integrations:
      - **Firestore**: don't spend a real network probe just to render a badge if avoidable — cheapest
        honest signal is attempting one lightweight `.limit(1).get()` with a short timeout;
        success/failure (not literally "online/offline", Firestore doesn't expose a ping endpoint).
      - **Gemini**: showing true network uptime means burning a real API call (cost + quota) just
        to paint a status dot. Cheaper and arguably more honest: reflect whether
        `SettingsRepository.geminiApiKey` is non-blank ("Configurada" / "Não configurada") rather
        than claiming "Online". If true uptime is actually wanted, that's a deliberate tradeoff to
        confirm with the user first, not a default.

## 6. Connectivity
- [ ] Define client↔Firestore sync strategy per §4 (snapshot listeners vs one-shot fetches,
      offline persistence — Firestore's built-in offline cache is likely sufficient, no custom
      queue needed).
- [ ] Trainer→Student ficha assignment is a Firestore write (`workouts` doc `status` flips to
      `assigned`) the Student's snapshot listener picks up — no push/notification transport
      needed, Firestore's own real-time listeners cover both directions (assignment down,
      `workoutLogs` up). This is the whole "connects with the trainer" mechanism from Product
      goal #2/#3 — no extra messaging layer required.
- [ ] Define client↔Cloud Function contract for Gemini generation once the §3 proxy exists
      (request: student profile + trainer prompt; response: same structured JSON
      `GenerativeAiService` already parses via `WorkoutParser`).
- [ ] No other third-party integrations in scope currently (no push notifications, no payments
      — do not add unless requested).

## 7. Auth
- [x] Firebase Auth (email/password) + Firestore-stored `role` field, read client-side.
- [x] `firestore.rules` written (users self-read, role/trainerId self-promotion blocked,
      students/workouts/biometrics/schedules/workoutLogs scoped by `trainerId`, students read-only
      on their own docs) and published via the Firestore console Rules tab. Verified live with an
      unauthenticated REST probe returning `403 PERMISSION_DENIED` (not open, not 404-missing-db).
- [ ] **Student↔Trainer linking — revised 2026-08-17: invite-code pattern, no Cloud Function
      needed.** The original plan required a Cloud Function (blocked on the Blaze plan). Researched
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
- [ ] Add basic auth UX gaps: password reset flow now that self-registration exists (`register()`
      already added to `AuthRepository`/`AuthViewModel`/`LoginScreen`, 2026-08-16 — password reset
      is the remaining gap, same screen, `auth.sendPasswordResetEmail(email)`).

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
- [ ] **Firebase App Check — not enabled** (noticed the console's own banner prompting this while
      working in Firestore, 2026-08-17: "Proteja os recursos do Cloud Firestore de abusos, como
      fraude de faturamento ou phishing"). App Check attests that requests hitting
      Firestore/Auth/the future Cloud Function actually come from *this* real app build, not a
      script replaying the API key — directly relevant now that self-registration (`register()`)
      and the invite-code system above both accept unauthenticated-adjacent writes (account
      creation, invite lookups) that a script could otherwise hit directly with just the public
      API key. Low effort (Play Integrity provider on Android, a few lines in `MainApplication`),
      meaningfully raises the bar against automated abuse. Do this alongside the invite-code work,
      not as an afterthought — it's cheapest to add before there's real invite-code traffic to
      protect.

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
- [ ] Add Compose UI tests (instrumented) for at least the Trainer golden path once Student flow
      exists: login → add student → assign workout → student logs a session → trainer sees the
      update and the evolution chart moves. Still blocked on §5b (Student screens don't exist yet).
- [ ] Wire a single command that runs everything (`./gradlew test connectedAndroidTest lint` or
      split unit vs instrumented as CI stages — see §11).

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
- [ ] `StudentDetailsScreen.kt` (2.195 tokens) and `ManualWorkoutScreen.kt` (1.661 tokens) are
      the largest files in the project — not alarming yet, but if they keep growing, split UI
      state/logic into smaller composables or move logic into their ViewModels.

## 11. CI / Deployment
- [ ] No `.github/workflows/` exists. Add a workflow that runs on every push/PR:
      `./gradlew lint testDebugUnitTest assembleDebug` at minimum (skip
      `connectedAndroidTest`/instrumented tests in CI unless an emulator/matrix is set up — that
      can come later). Needs a CI-safe placeholder or secret-injected `google-services.json`
      (store the real one as a repo secret, write it to `app/google-services.json` in the
      workflow step — never commit it).
- [ ] Release signing: no keystore/signing config present. Before a Play Store release, generate
      a release keystore (or use Play App Signing, the current recommended default — Google
      holds the app signing key, you keep an upload key) and wire `signingConfigs` in
      `app/build.gradle.kts`. Do not commit the keystore or its passwords; inject via CI secrets
      or local `local.properties` (already gitignored).
- [ ] Play Store listing prerequisites not started: privacy policy (required — the app handles
      health/biometric data (`medicalNotes`, biometrics) which is sensitive), Data Safety form,
      app icon/screenshots, store listing copy.

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

## Suggested build order (what blocks what) — revised 2026-08-17

**Done** (§0, §1 CLAUDE.md, §2 git, §4a Firestore migration, §5d UI debt + AI button wiring, §7
firestore.rules + self-registration, §8 INTERNET/backup-exclusion/R8, §9 first real tests, §10
lint) — see each section's `[x]` items for what was actually verified, not just attempted.

Next, in order:

1. **§7 invite-code Student↔Trainer linking** — resolve the data-model decision (unify vs.
   bridge, see §7) first, it's a prerequisite decision, not code. Then: `invites` collection +
   rules, trainer "Gerar convite" UI, student claim UI.
2. **§5b Student screens** (My Workouts, Log Session, My Evolution) — needs #1 done first (a
   student needs a `trainerId` before any of these queries mean anything).
3. **§5e ADM Dashboard** — independent of #1/#2, can run in parallel: needs one decision first
   (Logs tab: device-local Room vs. Crashlytics, see §5e), then Gestão tab (real counts, already
   researched, no blocker) and APIs tab (honest status, decide on removing the unused OpenAI key
   field) can proceed immediately.
4. **§8 Firebase App Check** — do alongside #1, before real invite-code traffic exists to abuse.
5. §5c Trainer-side "recent activity" + generalized evolution chart → delivers Product goal #4,
   needs #1/#2 done first (nothing to show otherwise).
6. §3 Cloud Function Gemini proxy + SDK migration (deprecated `com.google.ai.client.generativeai`
   → Firebase AI Logic SDK) → still needs the Blaze plan; unblocks safely shipping the AI feature
   given the June/Sept 2026 Gemini key deprecation deadlines, and unblocks the PDF-grounding
   follow-up in §5d.
7. §9 remaining tests (Compose UI golden path, needs #1/#2 built first) + §11 CI → safety net.
8. §8 remaining hardening (encrypted key storage, signing) + §11 store prerequisites → Play Store
   readiness.
9. §12 Phase 2 (messaging, payments, photos, booking reminders) — only if/when explicitly
   prioritized; each deserves its own `/newgoal` pass when the time comes.
