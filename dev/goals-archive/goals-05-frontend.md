<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §5 elsewhere in GOALS.md point here. -->

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
      - [x] **Done 2026-09-15**: "Editar" (`WorkoutCard`'s edit icon inside `WorkoutBuilderScreen`)
        now navigates to `ManualWorkoutScreen` with an optional `workoutId` route param, which
        prefills name/exercises from the existing entity and calls `updateWorkout` instead of
        `insertWorkout` on save (preserves `isActive`/`status`/`assignedAt`/`createdAt`). Verified
        via `./gradlew compileDebugKotlin verify` (all green).

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
