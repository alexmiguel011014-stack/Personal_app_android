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

## Web front (GOALS.md §23)

> On `main` the website arrived as one piece (2026-09-30): `web/`, its two workflows and the live
> `firestore.rules`. The plan it was built from — GOALS.md §23 and the references to it in the code
> comments — is in `main`'s GOALS.md too since 2026-10-01 (§19–§25 were brought over from
> `feature/kmp-web` and the template branch; §26–§28 are the later web plans).

`web/` is a Next.js 16 app (App Router, npm), the only website — it replaced the Kotlin/JS web
build, which is gone (no `js` target, no `jsMain`; removed at §23l, 2026-09-28). Phase 1 — every
screen, unstyled — was built (§23d–§23i), went live on GitHub Pages (§23l), and passed the
trainer's validation (§23j, 2026-09-28). The visual pass (§23k) followed, from the trainer's own
ALLU template. `web-ci.yml` checks it on every push and pull request; `web-deploy.yml` publishes
it. Until §23 says otherwise:

- **Styling is one stylesheet, `web/src/app/globals.css`** — the ALLU template's class names and
  breakpoints (>1050, 861–1050, ≤860 tablet/phone with a bottom tab bar, ≤600, ≤430), plus
  defaults for bare elements, in the colours and type of **direction B "Energia"** (chosen from
  `web/design/preview.html`, 2026-10-05): warm paper, ink-dark rail, burnt orange `#c2410c` for the
  primary action and the current nav item, 6 px corners, Barlow Condensed headings over Inter
  (self-hosted from `@fontsource/*`, imported in `layout.tsx`, so the CSP's `font-src 'self'`
  holds). Colours are tokens in `:root` (the names `--forest`/`--leaf` survive from the first
  green pass and now mean "dark ink" / "highlight on dark"); success/warning/danger keep green /
  amber / red and always come with a word. No CSS framework, no component library, no CSS-in-JS. Extend
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

**ADM area (§26).** `/admin` has its own `RequireArea` guard and `AppShell`; its navigation is
Visão geral, Personais, Solicitações and Minha conta. `destinationFor` sends an ADM to `/admin`,
so opening `/app` sends them back to their admin area. The browser screens query trainer profile
documents and aggregate collections only: `trainerStats`, `trainerActivity`, count-only student
queries, and `adminAudit`; they do not fetch student documents. An ADM can technically read every
`users` document under the existing Firestore rules, so this UI boundary is not a claim that the
underlying role lacks that permission.

`trainerStats/{trainerId}` is written by the trainer's web `/app` visit from the existing dashboard
figures and snapshot, with `lastSeenAt` throttled by `shouldWriteLastSeen`. It contains counts and
billing totals, not student records. `trainerActivity/{trainerId}_{YYYY-MM}` is written by the
trainer client through `trackActivity`: action counters and local calendar days, with telemetry
errors swallowed so they cannot block the trainer's action. `adminAudit` is append-only from the
admin client for create, suspend/reactivate, promotion/rejection and reset-email actions; profile
and status changes write their audit entry in the same Firestore transaction/batch.

Suspension sets `users/{uid}.accessStatus` to `suspended` (plus timestamp/reason) and Firestore
rules then deny that trainer's protected reads and writes. It does not disable or delete the Firebase
Auth account; the trainer can still read their own user profile so the site can explain the status.
The self-update rule freezes `accessStatus`, `suspendedAt` and `suspendedReason`, preventing
self-reactivation. Linked students retain access to their assigned data and their own logs. The
ADM create-personal flow uses a named secondary Firebase app/Auth instance, then signs it out and
deletes it so the ADM session stays active. When emulators are enabled, the secondary Auth instance
must connect to the Auth emulator too; the primary Firestore client continues to handle the profile
and audit write. See `web/src/data/adminCreate.ts` and GOALS.md §26 for the manual App Check caveat.

**The trainer's exercise reference is hidden** (GOALS.md §33, 2026-10-06). The reference behind the muscle
activations is never shipped, bundled, prompted or named on screen. It lives only in the gated Firestore document
`appData/exerciseCatalog` (rules v6: an approved active trainer or the ADM may `get` it, nobody can list, only the
ADM writes), seeded and updated by the owner-run `npm run catalog:publish` (emulators by default, `-- --production`
for the real project) from the Android asset or `CATALOG_SOURCE`. The web's own prompts (`web/prompt/`: single,
multi, Gemini system instruction) ask the AI for names + sets × reps only; the site fills the muscles in by name
(`data/exerciseCatalog.ts` `loadExerciseCatalog`, memory-only, cleared at sign-out) and computes the per-muscle
volume itself; `domain/volumeFeedback.ts` sends the AI only aggregated totals, never a coefficient. Every sentence
about the data is in `domain/editorCopy.ts`, and the review offers at most three "Quis dizer…?" names, never the
list. The guards are `domain/referenceLeak.test.ts`, `npm run check:leak` (in `web-ci.yml` and before the Pages
upload in `web-deploy.yml`) and `npm run e2e:ficha-privacy`; their sentinels are derived from the source at run time
(`LEAK_SENTINELS_FILE`, `LEAK_EXTRA_PHRASES`) and they fail, not pass, when there is nothing to guard. **Do not**
reproduce rows, the ruler, the document's wording or its original file name in any tracked file, comment, doc or test,
and never put the reference under `public/`. What a static site cannot hide — a signed-in trainer's DevTools, the
per-muscle totals — only a server (Cloud Function, Blaze) would; that and the public repository/Android asset are
owner decisions (GOALS.md §33i). `domain/fichaPrompt.ts` `buildFichaPrompt` stays only as the phone's prompt port.

**Branded Firebase e-mails (§32).** The verification, password-reset and e-mail-change mails are Firebase's,
sent from its own sender; the repo keeps only what the console is told to say — `web/email/*.html` (the exact
bodies pasted into Authentication → Templates, which has no versioning; `src/domain/authEmailTemplates.ts`
lints them: inline styles and Firebase placeholders only, palette from `globals.css`, no image/web font/
`%DISPLAY_NAME%`) — and the page the links open once each template's console *action URL* points at it:
`/acao/` (`app/acao/`, `domain/authAction.ts`, `data/authAction.ts`). `safeContinueUrl` is the only thing that
may send a visitor on from `/acao/` (`continueUrl` is attacker-controlled; same origin + base path only), and
`oobCode` is spent once (the effect guards against React's dev double-run). The action URL applies to every
client (web, Android's reset, iOS), so the page must be live before the console is switched, per template,
verification first and password reset last; clearing the URL is the rollback. Console steps and the order are
in `web/README.md`; sender domain / SMTP / own sending are deferred decisions (GOALS.md §32h).

**Account settings (§29).** Each role has a guarded account route: `/admin/conta`, `/app/conta`,
and `/aluno/conta`; the profile/avatar chip links there while sign-out stays separate. `users/{uid}`
stores the optional contact `phone` and `avatarStoragePath`. Phone is unverified contact info, not
Firebase phone authentication. Auth remains authoritative for e-mail/password: e-mail changes use
`verifyBeforeUpdateEmail`, then reload/refresh the ID token and sync the verified address into the
user profile; password changes require current-password reauthentication. Reset-email actions remain
the recovery path. **A user may correct their own name once every 60 days** (§29g, rules v5): the account page's "Nome"
section (`_shared/AccountNameSettings.tsx`, `data/account.ts` `savePersonalName`, pure rules in `domain/accountName.ts`)
writes `users/{uid}.name` together with `nameChangedAt`, a Firestore timestamp stamped by the server (web-only, like
`archivedAt`; the phone ignores it). `firestore.rules`' `validSelfNameChange` accepts a rename only when the name is 2–80
characters, trimmed, without control characters, different from the current one, `nameChangedAt == request.time` (so a
device clock decides nothing) and the previous stamp is missing or at least 60 days old; without a rename the stamp cannot
move. The owning trainer's correction of a linked student's name is another rule and neither needs nor resets the stamp. Avatar objects use `account-avatars/{uid}/profile`, are read as bytes through the
authenticated client (no bearer download URL), and are limited by UI and `storage.rules` to JPEG,
PNG or WebP up to 2 MiB. Keep initials as fallback. `firebase.json` configures the Storage emulator
on port 9199. Production bucket/plan/App Check setup and deployment of reviewed rules are owner-run
manual gates; never enable Blaze or publish rules automatically.

**Platform subscriptions and website invite capacity (§30).** Platform terms, invoices and payment
records are separate from `billingPlans`/`payments`, which are what a trainer charges their own
students. ADM plan templates/defaults live at `/admin/planos`; trainer terms, trial, invoice/payment,
extensions, and manual invite resolution by code are in the trainer's admin detail. That ADM screen
does not list invitation documents or show their exact count because those documents contain
student contact and health fields; the ADM asks the trainer for a code and records a reason to
resolve it. A privacy-safe exact ADM count still needs an aggregate/backend design. Trainer student
detail shows the trainer's own live website invite count and limit. The ADM recovery action creates
only a draft for the selected trainer, without creating an Auth account or bypassing the student's
verified-email invite claim. New Web invites have `expiresAt: null` and do not expire automatically;
the trainer cancels them manually. Legacy invitations with no `expiresAt` remain active until ADM
resolution; numeric legacy `expiresAt` values retain time-based handling for compatibility.

The invitation cap applies to the cooperative Web creation flow only. Its reservation/revision
transaction serializes cooperating site requests, and the trainer's count includes active invites
created by other clients. Android/mobile creation and direct Firestore writes outside that flow are
not globally constrained by this website counter. Never document or describe it as a global limit.
Production Firestore rules publication, any owner decision to enable Blaze/deploy a callable, and
controlled live-account checks remain manual gates until completed and evidenced.

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
| `domain/fichaPrompt.ts` `buildFichaPrompt` | `PromptFichaViewModel.buildPrompt` (the phone's template and table are Android assets; **the web no longer copies or uses them** — §33) |
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
trainer decided the phone doesn't show payments), the dashboard's numbers (`domain/metrics.ts`,
`domain/dashboard.ts`), and the **several-treinos-at-once ficha flow** (GOALS.md §25):
`parseWorkouts` in `domain/workoutParser.ts` splits one pasted answer ("Treino A / B / C…") into one
treino each — it is *added beside* `parseWorkoutName`/`parseExercises`/`applyPaste`, which mirror
`WorkoutParser.kt` and must NOT change (the phone still pastes one ficha at a time, and the two must
agree on it); `data/workouts.ts` `saveWorkouts` writes the treinos in one atomic batch (same stored
documents as one-by-one); the review screen is `fichas/editar/MultiFichaReview.tsx`. The multi-treino
prompt (`web/prompt/ficha_prompt_multi.md`), the single-treino prompt used when editing a ficha
(`ficha_prompt_single.md`) and the Gemini system instruction (`web/prompt/ficha_system_gemini.md`) are web-only —
the phone's template asks for one ficha with a muscle block per line, which needs the reference table the web
never shows (§33) — and `scripts/copy-prompt-assets.mjs` copies only these three into `public/prompt/`.

**A student adds extra sets only if the trainer allowed it** (2026-10-01): `users/{uid}.canAddSets`,
a third trainer-granted flag beside `canSelfAssess`/`canLogBiometrics` — off by default and when the
field is missing (every document the phone wrote), set only by the owning trainer from the student's
page (`data/students.ts` `setCanAddSets`), and frozen against the student's own writes in
`firestore.rules` (the rules must be republished for the flag to be writable — see the rules section).
On the logging screen (`aluno/treino/LogSession.tsx`) every prescribed set has its row and there is no
"Adicionar série" without the flag; with it, adding asks "Deseja adicionar uma série extra?" (Sim/Não,
`_shared/ConfirmDialog.tsx`), and only rows past the prescribed count can be removed
(`domain/sessionLog.ts` `isExtraRow`/`canAddExtraRow`). It is a screen rule, not a data rule: Firestore
does not check how many sets a log holds, and the phone's own button is unchanged.

**A new account needs a confirmed e-mail before it gets a profile** (GOALS.md §27, 2026-10-01).
Firebase checks only an address's shape, so `firestore.rules`' `hasVerifiedEmail()`
(`request.auth.token.email_verified`) guards the entry doors — the invite claim (create *and* re-claim of
`users/{uid}`) and `trainerRequests` create — and nothing else: every account that already has a profile
(none was ever asked to confirm) keeps working. The rule reads the **ID token**, which does not change
when the link is opened elsewhere: before a gated write call `confirmVerified` (`data/emailVerification.ts`
— `reload()` *then* `getIdToken(true)`); skip the second step and the rules still see `false`. `/convite`
sends the link (its continue URL is the same invite) and waits on `convite/VerifyEmailPanel.tsx` (resend
with a cooldown, "Já confirmei", a re-check when the tab is shown again, "Usei o e-mail errado" deletes
the unconfirmed account). `domain/emailPolicy.ts` (stricter syntax, "você quis dizer…?", throwaway
domains) runs on new sign-ups only and is a courtesy, not security — a throwaway inbox can confirm.
The gate holds only once the rules are republished; if the phone's student sign-up is live, it needs
the same flow first (GOALS.md §27g). On the emulators, `node scripts/verify-email.mjs <email>` opens the
link.

**Replacing a student's ficha keeps only the previous one** (GOALS.md §28, 2026-10-01). A "ficha" is one treino
(`workouts/{id}`), with no cycle grouping, so the editor asks — when the student already has an active treino —
"Substituir a ficha atual?" (*Cancelar* / *Só adicionar* / *Substituir*; `FichaEditor.tsx`, new treinos only —
editing one never replaces). *Substituir* is `data/workouts.ts` `replaceFicha`: ONE atomic batch that creates the new
treinos, archives the current (active) ones and deletes the history the previous replacement left. The history is
marked by a web-only field, `workouts/{id}.archivedAt` (written only when set; the phone ignores it, and a phone save
that drops it just makes the treino an ordinary inactive one). What may be deleted is decided in
`domain/fichaHistory.ts` `planReplacement`, and the bound is the point: only **inactive treinos that carry
`archivedAt`**, and **only when something is archived in the same replacement** — drafts, treinos deactivated by hand
and anything the phone wrote are never candidates; re-activating a history treino (`withDerivedStatus`) clears the mark.
Nothing is deleted outside a replace (no background job: Spark has no scheduler), no rules change was needed, and
`workoutLogs` are never touched, so the progress charts keep their history. Accepted: two tabs replacing at the same
instant (a client transaction cannot run a query) could leave two active fichas — never lost data. The student page
(`WorkoutsSection.tsx`) groups the list as Ficha atual / Ficha anterior (histórico) / Outras (inativas).

**No AI provider key ever reaches the browser** (decided 2026-09-24, GOALS.md §23e): the web builds
the §15 prompt for the trainer to paste into whichever AI app they use, and reads the reply back
with Smart Paste. **One exception, added 2026-09-30 (GOALS.md §25i): the ficha editor's "Gemini"
tab calls Gemini through Firebase AI Logic** (`data/gemini.ts`) — the Gemini Developer API's free
tier from the browser with *no key in the page* (access is configured in the Firebase console and
every request carries an App Check token), so the rule about keys still holds. Rules for that call:
the model id is one constant (`GEMINI_DEFAULT_MODEL`, overridable by the Remote Config parameter
`ficha_model_name`) because ids rotate and a retired one answers 404; the student's name and medical
notes are NOT sent unless the trainer ticks the box (on the free tier Google may use content to improve
its products); every failure points at the copy-and-paste tab, which stays the fallback. Any other
provider, or any key in the browser, still needs its own decision. Direct generation with BYO keys
(`GenerativeAiService`) stays on Android; a server-side proxy would be its own item (a Cloud
Function, which needs the Blaze plan).

Checks, from `web/`: `npm test`, `npm run lint`, `npx tsc --noEmit` (run `npx next typegen` first
on a fresh checkout), `npm run build`, and `npm run test:rules` (emulators, Java 21).

## Security rules (`firestore.rules`)

One Firestore database serves every client (Android, web, iOS), so there is one live rules file —
published by hand by the trainer (console copy-paste, or `firebase deploy --only firestore:rules`
with their own login). **`firestore.rules` on `main` is the live copy** (the web work's `004a029`,
GOALS.md §23d on `feature/kmp-web`): it carries the `payments`/`billingPlans` rules and closes the
privilege hole an older §17 version had. Any older copy on another branch must not be published.
Never publish a copy without diffing it against what's live.

**Rules are versioned in ascending order.** The first line of `firestore.rules` is `// Rules version: N`,
and every set is kept byte for byte as `firestore-rules/versions/vN.rules` (v3 is what was live on 2026-10-05).
Work that changes the rules bumps N by one for the whole unpublished set — **v4** carried the
account/plan/billing rules (§29–§30) and the spent-invite read restriction (§31b), **v5** adds the 60-day own-name
rule (§29g), **v6** adds the gated `appData/exerciseCatalog` document (§33) — and adds `vN.rules`
in the same PR, identical to `firestore.rules`. Until the trainer publishes it, a candidate may still change:
edit both files together (`cp firestore.rules firestore-rules/versions/vN.rules`) and keep them identical.
Once a version is published its file is frozen: later changes start the next number. `npm run check:rules-version`
(from `web/`; also a unit test, so `npm test` and the deploy build enforce it, and a named CI step) fails when the
header, the archive's existence or the two files' contents disagree.

Every rules change gets a test in `web/rules/firestore.rules.test.ts`, run against the local
emulator with `npm run test:rules` from `web/` (Java 21; see `web/README.md`). `assertFails`
passes on *any* failure, so a new "rejects X" test proves nothing until it's been seen failing
against the old rules: `RULES_FILE=<published copy> npm run test:rules` does exactly that.
