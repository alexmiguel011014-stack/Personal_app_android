<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §8 elsewhere in GOALS.md point here. -->

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
