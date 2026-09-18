<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §7 elsewhere in GOALS.md point here. -->

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
