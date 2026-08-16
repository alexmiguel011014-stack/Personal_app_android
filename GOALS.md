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
- [ ] **Android SDK Platform 37 + matching build-tools installed.** Only `platforms;android-34`
      and `build-tools;34.0.0` are installed locally so far, but `app/build.gradle.kts` declares
      `compileSdk = 37` / `targetSdk = 37`. Run before the first build:
      `sdkmanager --sdk_root=<repo>/android-sdk "platforms;android-37" "build-tools;37.0.0"`
      (fall back to the latest available `platforms;android-3x` if 37 isn't published yet under
      that exact revision — check with `sdkmanager --list`).
- [ ] `app/google-services.json` is **missing**. The `com.google.gms.google-services` plugin is
      applied unconditionally in `app/build.gradle.kts`, so **the project cannot build at all**
      until this file is added (from Firebase Console → Project settings → your Android app,
      package `com.example.personalapp`). This is the single hardest blocker to a first build.
- [ ] Create a Firebase project (or confirm the existing one) with Auth (Email/Password) and
      Firestore enabled, matching applicationId `com.example.personalapp`.

## 1. Project identity
- [x] `README.md` exists and accurately describes the app, stack and setup steps.
- [ ] Add a `CLAUDE.md`/`AGENTS.md` at the project root documenting conventions that aren't
      obvious from the code: the role-routing model in `RoleRouter.kt`, the local-Room-only data
      layer (see §4), and the "Smart Paste" workout import format `WorkoutParser.kt` expects.

## 2. Version control
- [x] Git repository, remote configured (`github.com/alexmiguel011014-stack/Personal_app_android`).
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

## 4. Database — Firestore sync + new workout-log model

**4a. Firestore as source of truth (confirmed requirement — see Product goal)**
- [x] Room local DB (`AppDatabase`, v5) with entities: `UserEntity`, `BiometricEntity`,
      `WorkoutEntity`, `HistoryEntity`, `ScheduleEntity`. Full CRUD via `AppDao`/`TrainerRepository`.
- [ ] **`TrainerRepository` is 100% local (Room-only) — students, workouts, biometrics, schedule
      and history never touch Firestore.** Only auth + role live in Firebase. Migrate Firestore
      to be the source of truth for students/workouts/schedule/logs, with Room as an
      offline-first cache (repository writes to Firestore; a snapshot listener mirrors into
      Room; UI reads Room). Required for the Student login flow (#2 in Product goal) to have
      anything to show, and for a trainer's data to survive a reinstall/new device.
- [ ] Firestore schema, per-trainer scoped (`trainerId` field on every doc + rules, not open
      collections):
      - `users/{uid}` — existing: `role`, profile fields. Add `trainerId` on Student user docs
        (which trainer they belong to — needed so a Student's queries can be scoped).
      - `students/{studentId}` — mirrors today's `UserEntity` (profile/biometric-adjacent
        fields), owned by `trainerId`.
      - `workouts/{workoutId}` — mirrors `WorkoutEntity` (`studentId`, `name`, `exercises[]`,
        `isActive`, `createdAt`). Add `assignedAt` / `status` (`draft` | `assigned`) so a
        Trainer can build a ficha before pushing it to the student — matches Product goal #1.
      - `biometrics/{entryId}` — mirrors `BiometricEntity`.
      - `schedules/{scheduleId}` — mirrors `ScheduleEntity`.
      - **`workoutLogs/{logId}` — new collection, does not exist today.** One doc per exercise
        actually performed in a session: `studentId`, `workoutId`, `exerciseName` (or index into
        the plan), `date`, `performedSets: [{setNumber, weight, reps}]`, optional `note`.
        Written by the Student after a session ("atualização de carga" — Product goal #3), read
        by the Trainer for the evolution report (#4).
- [ ] New Room entity mirroring `workoutLogs` (`WorkoutLogEntity` + `PerformedSet` — analogous to
      how `Exercise` is embedded in `WorkoutEntity` today) so the offline cache pattern in the
      item above covers it too.
- [ ] Room migration strategy: currently `fallbackToDestructiveMigration(dropAllTables = true)`
      and `exportSchema = false` — fine for pre-release iteration, **not** for a shipped app
      (any schema bump wipes user data, and the new `WorkoutLogEntity` above is itself a schema
      bump). Before first Play Store release: set `exportSchema = true`, commit the schema JSON,
      and write real `Migration` objects for any version bump from that point on — including the
      one this feature work introduces.

## 5. Frontend (Jetpack Compose)

**5a. Existing (Trainer/ADM side)**
- [x] **Trainer role** — fully built and routed (`AppNavigation.kt`): Main (students list +
      bottom-nav tabs including `ScheduleScreen`), AddStudent, EditStudent, StudentDetails,
      ManualWorkout (detailed exercise builder), WorkoutBuilder, AIWorkout (Gemini generation +
      "Smart Paste" import via `WorkoutParser.kt`), Settings (API key entry).
- [x] **ADM role** — `AdminDashboardScreen` exists and is routed from `RoleRouter`.
- [x] Evolution/biometrics chart exists: `Components.kt` has a custom `WeightChart` (Compose
      `Canvas`, hand-drawn line + points), used from `StudentDetailsScreen`. No charting library
      dependency — keep it that way; extend this same component for exercise-load progression
      (5c) instead of adding a charting library.

**5b. Student role — not built (Product goal #2)**
- [ ] `RoleRouter` currently routes `STUDENT` back to `LoginScreen` with a placeholder message —
      no student-facing screen exists at all. Blocked on §4a (Firestore migration). Build, once
      unblocked:
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
- [ ] `DayAgendaItem` (`Components.kt`, used by `ScheduleScreen`) has a non-functional
      "add appointment" button: `onClick = { /* Agendar */ }` is an empty placeholder — tapping
      "+" on any hour slot does nothing. This is the single most visible "looks unfinished" bug
      in the app today; wire it to actually create a `ScheduleEntity`/schedule doc.
- [ ] `Components.kt` hardcodes raw hex colors instead of `MaterialTheme.colorScheme` (e.g.
      `StudentCard`'s pink/blue-by-gender background, `Color.Black` text, `Color.Gray` labels,
      the chart's fixed blue). The app already ships a proper light/dark theme
      (`values/themes.xml`, `values-night/themes.xml`) that these composables bypass — audit
      every screen for raw `Color(0x...)`/`Color.Black`/`Color.Gray` usage and replace with theme
      tokens so dark mode (and any future theming) is actually consistent app-wide. Keep the
      gender-based card tint as a *deliberate* choice if wanted, but source the two colors from
      the theme (e.g. `tertiaryContainer`/`secondaryContainer`) instead of hardcoded hex.
- [ ] Sweep every screen for missing **loading / empty / error states** — the codebase has no
      loading-skeleton or empty-state pattern today (confirmed: only one commit in this repo's
      history, "Initial commit", so this predates any UI polish pass). At minimum: a students
      list with zero students, a workout list with zero workouts, and any Firestore-backed screen
      mid-load (post-§4a) need explicit states instead of a blank screen.
- [ ] Form validation pass on Add/Edit Student and the manual workout builder — confirm
      required fields (name, at least one training day) are actually validated before save, with
      inline error messages rather than silent no-ops or crashes.

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
- [ ] **Firestore security rules file does not exist anywhere in the repo** (`firestore.rules`
      not found). This means the project either has no deployed rules (default deny — nothing
      works) or is running Firebase's insecure "test mode" (`allow read, write: if true` —
      anyone can read/write any user's data, including their own `role` field and self-promote
      to `ADM`). Write and commit `firestore.rules`:
      - Users can read their own `users/{uid}` doc; only an ADM (or a Cloud Function) can write
        the `role` field — never the user themselves.
      - Trainer-scoped collections (`students`, `workouts`, `schedules`) readable/writable only
        by the owning `trainerId`; students get read-only access to documents where they are the
        `studentId`, once §4's schema exists.
      - Deploy via `firebase deploy --only firestore:rules` (requires Firebase CLI + project
        linked — not yet set up locally).
- [ ] **Student↔Trainer linking (Product goal #2) — decide the mechanism:** today
      `AddStudentScreen` only creates a local `UserEntity` row, no auth account. Extend it so
      adding a student also provisions their login, e.g.: Trainer enters the student's email in
      `AddStudentScreen` → a Cloud Function creates a Firebase Auth user (or a pending invite)
      with `role = STUDENT` and `trainerId = <this trainer's uid>` already set in Firestore, and
      the student sets their password on first login. This keeps `role`/`trainerId` writable
      only server-side (see the security-rules item above), so a student can never self-assign a
      trainer or a role.
- [ ] Add basic auth UX gaps: password reset flow, and a way for an ADM to create
      Trainer/Student accounts with a role (currently unclear how a non-ADM user first gets a
      Firestore `role` doc — likely needs to be set server-side/by an ADM, not client-writable).

## 8. Security
- [ ] **`AndroidManifest.xml` is missing `<uses-permission android:name="android.permission.INTERNET" />`.**
      Every network call in the app (Firebase Auth, Firestore, Gemini) will throw at runtime
      without it. This is the second build/run blocker after `google-services.json` — add it
      before first run on a device.
- [ ] Gemini/OpenAI API keys are stored in **plaintext** DataStore Preferences
      (`SettingsRepository`) with `android:allowBackup="true"` and no backup-exclusion rule, so
      the key is included in Android's automatic cloud/local backups. Once §3's server-side
      proxy exists this key may no longer need to live on-device at all; if a "bring your own
      key" mode is kept, exclude the DataStore file in `data_extraction_rules.xml`/
      `backup_rules.xml`, and consider `androidx.security.crypto` (EncryptedSharedPreferences /
      Jetpack Security) if it must be stored client-side.
- [ ] Write `firestore.rules` (see §7) — currently the biggest concrete security gap.
- [ ] Release build has `optimization { enable = false }` in `app/build.gradle.kts` (AGP 9.x's
      new DSL for what used to be `minifyEnabled`/`shrinkResources`) — R8 shrinking/obfuscation
      is off for release. Enable it before shipping (`enable = true`, plus verify
      `app/src/main/keepRules/rules.keep` covers Room/Hilt/Firebase reflection needs) both to
      reduce APK size and to raise the bar on reverse-engineering the app (relevant given the
      API-key-storage point above).
- [ ] Target API compliance: `targetSdk = 37` already exceeds Google Play's Aug 31, 2026
      requirement (API 36 for new apps/updates) — no action needed here, just don't regress it.

## 9. Testing
- [ ] Only placeholder tests exist: `ExampleUnitTest` (trivial `2+2` assertion) and
      `ExampleInstrumentedTest` (default template) — no real coverage.
- [ ] Unit-test the actual business logic first, in priority order:
      1. `WorkoutParser` (Smart Paste text→exercise parsing) — pure function, highest value,
         easiest to test, most likely to silently break.
      2. `AuthRepository.login` role-resolution logic (mock `FirebaseAuth`/`FirebaseFirestore`).
      3. `TrainerRepository`/`AppDao` — Room in-memory database tests for CRUD + Flow emissions.
      4. Once built (§4a): the `workoutLogs` write path — a Student's logged sets must round-trip
         correctly (weight/reps per set, correct `workoutId`/`exerciseName` association) since
         this is the data the evolution report (§5c) depends on being accurate.
- [ ] Add Compose UI tests (instrumented) for at least the Trainer golden path once Student flow
      exists: login → add student → assign workout → student logs a session → trainer sees the
      update and the evolution chart moves.
- [ ] Wire a single command that runs everything (`./gradlew test connectedAndroidTest lint` or
      split unit vs instrumented as CI stages — see §11).

## 10. Code quality
- [ ] No lint/format tooling configured beyond Android Gradle Plugin's built-in `lint` task —
      confirm `./gradlew lint` runs clean; fix or explicitly suppress (with a reason) what it
      flags before CI is added.
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

## Suggested build order (what blocks what)

1. §0 SDK 37 + `google-services.json` + §8 INTERNET permission → **project builds and runs at
   all**.
2. §7 `firestore.rules` (even a minimal safe version) before any real user data touches
   Firestore — currently nothing stops data leakage/role self-escalation the moment Firestore
   rules move out of test mode, or the risk if they're already in test mode.
3. §4a Firestore-as-source-of-truth migration (incl. the new `workoutLogs` collection) → unblocks
   everything below.
4. §7 Student↔Trainer linking + §5b Student screens (My Workouts, Log Session, My Evolution) →
   delivers Product goal #2/#3, the core new feature.
5. §5c Trainer-side "recent activity" + generalized evolution chart → delivers Product goal #4.
6. §5d UI/professionalism debt (schedule button, hardcoded colors/theming, loading/empty/error
   states, form validation) → delivers Product goal #5/#6; can run in parallel with steps 3-5
   since it touches existing screens, not the new ones.
7. §3 Cloud Function Gemini proxy → unblocks safely shipping the AI feature given the June/Sept
   2026 Gemini key deprecation deadlines.
8. §9 real tests (incl. the new `workoutLogs` round-trip test) + §11 CI → safety net before
   iterating faster.
9. §8 release hardening (R8, key storage, signing) + §11 store prerequisites → Play Store
   readiness.
