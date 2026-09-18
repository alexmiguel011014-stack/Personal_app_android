<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §4 elsewhere in GOALS.md point here. -->

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
