<!-- Archived from GOALS.md on 2026-09-17: every item under this section was [x]. -->
<!-- Cross-references like §11 elsewhere in GOALS.md point here. -->

## 11. CI / Deployment
- [x] `.github/workflows/android-ci.yml` added: runs on push/PR to `main` — sets up JDK 21,
      writes `app/google-services.json` from a `GOOGLE_SERVICES_JSON` repo secret, runs
      `./gradlew verify` (lint + unit tests, the §9 task) then `assembleDebug`, uploads the lint
      HTML report as an artifact. `connectedAndroidTest`/instrumented tests deliberately excluded
      (no emulator matrix set up — can come later). YAML syntax validated locally.
      **Repo secret added 2026-08-21** (`gh secret set GOOGLE_SERVICES_JSON`, user confirmed) —
      confirmed live via a real green run, not just "added and assumed working": rerunning the
      previously-failing CI run after adding the secret produced a full pass (`Lint + unit tests`,
      `Assemble debug APK`, lint report upload, all green). **A second, previously-undiscovered
      bug was also blocking every CI run before this, found while debugging §18k's new iOS CI
      job**: `gradlew` was tracked in git as mode `100644` (not executable) instead of `100755`,
      so every push/PR to `main` had actually been failing at the very first `./gradlew` call —
      confirmed via `gh run list` showing failures on the last several pushes, all with the same
      "Permission denied" error, unrelated to the missing secret. Fixed with
      `git update-index --chmod=+x gradlew`, committed directly to `main`. Both root causes are
      now resolved — CI is verified genuinely green, the first time this project's CI has
      actually passed.
- [x] Release signing wired: `release-keystore.jks` generated (`keytool`, RSA 2048, PKCS12, valid
      10000 days, alias `personalapp-release`) at the project root. `app/build.gradle.kts` reads
      the store path + passwords from `local.properties` (both gitignored — added `*.jks`/
      `*.keystore` to `.gitignore` too) and wires `signingConfigs.release`, applied to the
      `release` build type only when those properties are present (so a clone without them still
      gets an unsigned release build, no regression). **Verified: `./gradlew assembleRelease`
      succeeds and produces a signed `app-release.apk`.** This is an upload key for local/manual
      release builds — before actually publishing to Play Store, enroll in Play App Signing
      (Google holds the real app signing key; this becomes the upload key) and treat these
      generated passwords as placeholders to rotate, not final production secrets.
- [x] **Decided 2026-08-18: not publishing to the Play Store.** With a small client base, the
      user judged the ongoing overhead (Data Safety form, listing upkeep, review process) not
      worth it for now — distribution will be direct (sideloaded `app-release.apk`, e.g. shared
      link/file to each trainer's device) instead. This makes the remaining Play Store-specific
      prerequisites (app icon/screenshots sized for the Store listing, the Play Console "Data
      Safety" form) **not applicable, not just blocked** — dropping them, not deferring them.
      What's still genuinely useful regardless of distribution channel, already done:
      - [x] Release signing (see above) — sideloaded APKs still benefit from being signed
        consistently across updates, so Android treats each new version as an update rather than
        a conflicting reinstall.
      - [x] Privacy policy drafted: `store-listing/privacy-policy.md` — covers every data type the
        code actually collects (see the §2 table: auth, profile, `medicalNotes`, biometrics,
        workout logs, invite codes, AI keys, Crashlytics, App Check). Still worth keeping even
        without a Store listing, given the health data involved (LGPD Art. 5º sensitive-data
        category applies regardless of distribution channel) — just host it wherever's convenient
        (a simple webpage, a shared doc) instead of a Play Console-mandated URL, and treat it as a
        starting draft, not legal advice.
      - `store-listing/listing-copy.md` (title/description/category) is now moot — Play Store-only
        content, safe to ignore or delete whenever.
