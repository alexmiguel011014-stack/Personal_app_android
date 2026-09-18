<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §3 elsewhere in GOALS.md point here. -->

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
