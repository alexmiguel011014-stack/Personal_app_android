<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §1 elsewhere in GOALS.md point here. -->

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
