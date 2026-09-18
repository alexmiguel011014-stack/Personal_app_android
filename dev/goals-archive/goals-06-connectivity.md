<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §6 elsewhere in GOALS.md point here. -->

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
